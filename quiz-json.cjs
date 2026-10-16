function parseQuiz(text){
 if(typeof text!=='string')throw Error('The AI returned no readable questions. No additional request was made.');
 let input=text.trim().replace(/^\uFEFF/,'');
 input=input.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{return JSON.parse(input);}catch{}
 // Only salvage complete question objects from the expected array, never invent missing text.
 const match=/^\s*\{\s*"questions"\s*:\s*\[/.exec(input);
 const questions=[];
 if(match){let i=match[0].length;
  while(i<input.length){
   while(/\s/.test(input[i]||'')&&i<input.length)i++;
   if(input[i]!=='{')break;
   const start=i;let depth=0,quoted=false,escaped=false,complete=false;
   for(;i<input.length;i++){const char=input[i];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;continue;}if(char==='"')quoted=true;else if(char==='{')depth++;else if(char==='}'&&--depth===0){i++;complete=true;break;}}
   if(!complete)break;
   try{questions.push(JSON.parse(input.slice(start,i)));}catch{break;}
   while(i<input.length&&/\s/.test(input[i]))i++;
   if(input[i]!==',')break;i++;
  }
 }
 if(questions.length)return {questions};
 throw Error('The AI response was incomplete or incorrectly formatted, and no complete questions could be recovered. Your saved tests are unchanged. No additional request was made.');
}
module.exports={parseQuiz};
