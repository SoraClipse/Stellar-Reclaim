import {test} from 'node:test';import {strict as assert} from 'node:assert';import {recoveryPage} from '../src/page.ts';
test('pages include guarded flows and voluntary warning',()=>{for(const path of ['/request','/inbox','/recoveries'])assert.ok(recoveryPage.includes(path));assert.match(recoveryPage,/cannot be reversed/);assert.match(recoveryPage,/No funds sent/);});
