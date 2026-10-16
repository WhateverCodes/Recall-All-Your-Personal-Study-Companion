const test=require('node:test'),assert=require('node:assert/strict');
const {generate,validateQuiz}=require('../quiz-ai.cjs');
const entries=[{id:'stack',title:'Stacks',url:'https://example.com/stack',text:'A stack removes the most recently added item first. This ordering is called last in, first out.'}];
const question={kind:'mcq',prompt:'Which structure is suitable for undoing the most recent action first?',options:['Stack','Queue','Set','Heap'],answer:'Stack',acceptedAnswers:['stack'],explanation:'A stack follows last in, first out.',sourceId:'stack',evidence:'A stack removes the most recently added item first.',code:''};
test('AI adapter requests structured locally grounded questions and validates answers',async()=>{let body;const questions=await generate(entries,'',async(url,request)=>{assert.equal(url,'http://127.0.0.1:11434/api/chat');body=JSON.parse(request.body);return {ok:true,json:async()=>({message:{content:JSON.stringify({questions:[question]})}})};});assert.equal(body.stream,false);assert.equal(body.model,'gemma3:4b');assert.equal(questions[0].answer,'Stack');assert.equal(questions[0].source,entries[0].url);});
test('rejects invented evidence, missing answer, duplicate choices and duplicate questions',()=>{for(const override of [{sourceId:'unknown'},{evidence:'An invented claim about a different algorithm.'},{answer:'Tree'},{options:['Stack','Stack','Queue','Heap']}])assert.throws(()=>validateQuiz({questions:[{...question,...override}]},entries));assert.throws(()=>validateQuiz({questions:[question,question]},entries));});
test('boolean and short answer types preserve their checking values',()=>{const result=validateQuiz({questions:[{...question,kind:'boolean',prompt:'A stack follows last in, first out.',answer:'True'},{...question,kind:'short',prompt:'Name the structure that removes the most recent item first.',options:[],answer:'stack'}]},entries);assert.deepEqual(result[0].options,['True','False']);assert.ok(result[1].acceptedAnswers.includes('stack'));});
test('AI connection failure is explicit, without random-word fallback',async()=>{await assert.rejects(generate(entries,'',async()=>{throw Error('offline')}),/Local AI did not respond/);});

test('generation keeps grounded questions from a mixed response without another API call',async()=>{
 let calls=0;
 const questions=await generate(entries,'',async()=>{calls++;return {ok:true,json:async()=>({message:{content:JSON.stringify({questions:[null,{...question,evidence:'This evidence was invented by the model.'},{...question,answer:'Tree'},question,question]})}})};});
 assert.equal(calls,1);assert.equal(questions.length,1);assert.equal(questions[0].answer,'Stack');
});
test('filtering never admits an unsupported quiz or turns it into an empty success',()=>{
 assert.throws(()=>validateQuiz({questions:[{...question,sourceId:'unknown'}]},entries,{keepValid:true}),/None of the generated questions/);
 assert.deepEqual(validateQuiz({questions:[]},entries,{keepValid:true}),[]);
});

test('requested difficulty reaches the tutor instruction',async()=>{
 let prompt='';await generate(entries,'',async(_url,request)=>{prompt=JSON.parse(request.body).messages[0].content;return {ok:true,json:async()=>({message:{content:JSON.stringify({questions:[question]})}})};},null,'hard');assert.match(prompt,/Requested difficulty: hard/);assert.match(prompt,/Multi-step reasoning/);
});

test('hard practice fills missing questions across bounded batches',async()=>{
 let calls=0;const {generateFull}=require('../quiz-ai.cjs');
 const result=await generateFull(entries,'',async(_url,request)=>{calls++;const body=JSON.parse(request.body);assert.match(body.messages[0].content,/Requested difficulty: hard/);const count=calls===1?1:9;return {ok:true,json:async()=>({message:{content:JSON.stringify({questions:Array.from({length:count},(_,i)=>({...question,prompt:'Which stack operation is appropriate in situation '+calls+' number '+i+'?'}))})}})};},null,'hard');
 assert.equal(calls,2);assert.equal(result.length,10);
});
test('repeated short batches never save a one-question practice test',async()=>{
 let calls=0;await assert.rejects(require('../quiz-ai.cjs').generateFull(entries,'',async()=>{calls++;return {ok:true,json:async()=>({message:{content:JSON.stringify({questions:[question]})}})};},null,'hard'),/Only 1 of 10/);assert.equal(calls,3);
});
