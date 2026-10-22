import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trace} from '../shared.mjs';
test('downward shots stop on arena floor and cannot hit below it',()=>{const o={x:0,y:1.62,z:11},d={x:0,y:-1,z:0};assert.equal(trace(o,d,null).distance,1.62);assert.equal(trace(o,d,{x:0,z:11,y:-3,hp:100}).part,null);});
