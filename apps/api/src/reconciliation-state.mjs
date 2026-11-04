/** Durable, fenced ledger scan progress. Does not verify payments or settle refunds.
 * Advance only after all operations through the cursor have been verified and
 * durably applied. Fencing prevents stale workers committing after takeover.
 */
import {randomBytes} from 'node:crypto';

const TOKEN=/^[0-9]{1,40}$/;
export class ReconciliationStateError extends Error {
  constructor(code){super(code);this.name='ReconciliationStateError';this.code=code;}
}
const validTime=x=>Number.isSafeInteger(x)&&x>=0;

export class ReconciliationState {
  constructor(db){
    this.db=db;
    db.exec(`CREATE TABLE IF NOT EXISTS reconciliation_progress (
      network TEXT PRIMARY KEY CHECK(network='testnet'),
      cursor TEXT, lease_token TEXT, lease_until INTEGER,
      updated_at INTEGER NOT NULL
    );`);
    this.getStmt=db.prepare('SELECT cursor,lease_token,lease_until FROM reconciliation_progress WHERE network=?');
    this.insert=db.prepare('INSERT OR IGNORE INTO reconciliation_progress(network,updated_at) VALUES(?,?)');
    this.claimStmt=db.prepare('UPDATE reconciliation_progress SET lease_token=?,lease_until=?,updated_at=? WHERE network=?');
    this.heartbeatStmt=db.prepare('UPDATE reconciliation_progress SET lease_until=?,updated_at=? WHERE network=? AND lease_token=? AND lease_until>?');
    this.advanceStmt=db.prepare('UPDATE reconciliation_progress SET cursor=?,updated_at=? WHERE network=? AND lease_token=? AND lease_until>?');
    this.releaseStmt=db.prepare('UPDATE reconciliation_progress SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE network=? AND lease_token=?');
  }
  transaction(fn){
    this.db.exec('BEGIN IMMEDIATE');
    try{const result=fn();this.db.exec('COMMIT');return result;}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  assertNetwork(network){
    if(network!=='testnet')throw new ReconciliationStateError('invalid_network');
  }
  read(network){
    this.assertNetwork(network);
    const row=this.getStmt.get(network);
    return {cursor:row?.cursor??null,leaseUntil:row?.lease_until??null};
  }
  acquire(network,now,duration=60){
    this.assertNetwork(network);
    if(!validTime(now)||!Number.isSafeInteger(duration)||duration<5||duration>300||!Number.isSafeInteger(now+duration))
      throw new ReconciliationStateError('invalid_lease');
    return this.transaction(()=>{
      this.insert.run(network,now);
      const existing=this.getStmt.get(network);
      if(existing.lease_token&&existing.lease_until>now)return null;
      const token=randomBytes(32).toString('hex');
      this.claimStmt.run(token,now+duration,now,network);
      return {token,cursor:existing.cursor??null,expiresAt:now+duration};
    });
  }
  heartbeat(network,token,now,duration=60){
    this.assertNetwork(network);
    if(!/^[a-f0-9]{64}$/.test(token??'')||!validTime(now)||!Number.isSafeInteger(duration)||duration<5||duration>300||!Number.isSafeInteger(now+duration))
      throw new ReconciliationStateError('invalid_lease');
    if(this.heartbeatStmt.run(now+duration,now,network,token,now).changes!==1)
      throw new ReconciliationStateError('lease_lost');
    return now+duration;
  }
  /** Caller must complete verification and persistence BEFORE advancing. */
  advance(network,token,cursor,now){
    this.assertNetwork(network);
    if(!/^[a-f0-9]{64}$/.test(token??'')||!validTime(now)||typeof cursor!=='string'||!TOKEN.test(cursor))
      throw new ReconciliationStateError('invalid_checkpoint');
    return this.transaction(()=>{
      const existing=this.getStmt.get(network);
      if(!existing||existing.lease_token!==token||existing.lease_until<=now)
        throw new ReconciliationStateError('lease_lost');
      if(existing.cursor!==null&&BigInt(cursor)<=BigInt(existing.cursor))
        throw new ReconciliationStateError('non_monotonic_cursor');
      if(this.advanceStmt.run(cursor,now,network,token,now).changes!==1)
        throw new ReconciliationStateError('lease_lost');
      return cursor;
    });
  }
  release(network,token,now){
    this.assertNetwork(network);
    if(!/^[a-f0-9]{64}$/.test(token??'')||!validTime(now))
      throw new ReconciliationStateError('invalid_lease');
    return this.releaseStmt.run(now,network,token).changes===1;
  }
}
