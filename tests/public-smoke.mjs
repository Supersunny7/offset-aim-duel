import {WebSocket} from 'ws';
const url=process.argv[2];const ws=new WebSocket(url,{origin:url.replace(/^ws/,'http')});
ws.on('open',()=>{console.log('OPEN');ws.send(JSON.stringify({type:'create',name:'Public-check'}));ws.send(JSON.stringify({type:'ping',time:Date.now()}));});
ws.on('message',raw=>{console.log('MESSAGE',raw.toString().slice(0,400).replace(/"token":"[^"]*"/g,'"token":"REDACTED"'));ws.close();});ws.on('close',(code,r)=>console.log('CLOSE',code,r.toString()));ws.on('error',e=>console.log('ERROR',e.message));setTimeout(()=>ws.terminate(),8000).unref();
