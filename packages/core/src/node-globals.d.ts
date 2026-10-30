declare const process: {
 argv:string[];
 exitCode?:number;
 env:Record<string,string|undefined>;
 stdout:{write(text:string):void};
};
declare const console: { log(...args: unknown[]):void; error(...args: unknown[]):void };
