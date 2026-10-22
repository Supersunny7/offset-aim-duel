const KEY='offset:room-session';
export function clearRoomSession(storage){try{storage.removeItem(KEY);}catch{}}
export function saveRoomSession(storage,welcome,now=Date.now()){
 try{storage.setItem(KEY,JSON.stringify({code:welcome.code,token:welcome.token,id:welcome.id,savedAt:now}));return true;}catch{return false;}
}
export function readRoomSession(storage,invite=null,now=Date.now()){
 try{const s=JSON.parse(storage.getItem(KEY));if(!s||!/^[a-f\d]{6}$/i.test(s.code)||!/^[a-f\d]{48}$/i.test(s.token)||!/^[a-f\d]{16}$/i.test(s.id)||!Number.isFinite(s.savedAt)||now<s.savedAt||now-s.savedAt>7200000){clearRoomSession(storage);return null;}if(invite&&invite.toUpperCase()!==s.code.toUpperCase())return null;return {type:'resume',code:s.code,token:s.token};}catch{return null;}
}
