const {randomInt}=require('node:crypto');
function shuffleOptions(question,random=randomInt){
 if(question.kind!=='mcq'||!Array.isArray(question.options))return question;
 const options=question.options.slice();for(let i=options.length-1;i>0;i--){const j=random(i+1);[options[i],options[j]]=[options[j],options[i]];}
 return {...question,options};
}
module.exports={shuffleOptions};
