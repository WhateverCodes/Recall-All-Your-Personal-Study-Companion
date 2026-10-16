(function(root){
 function topicsFor(result){return Array.isArray(result.topics)?result.topics:(result.pageSummaries||[]).map(p=>({id:p.url,url:p.url,title:p.title,sectionCount:p.sectionCount}));}
 function historyGroups(history,all=history){
  history=history.filter(q=>!q.isCombinedSession);all=[...new Map([...all,...history].filter(q=>!q.isCombinedSession).map(q=>[q.id,q])).values()];
  const ids=new Set(history.map(q=>q.originalQuizId||q.id));const groups=[];
  for(const id of ids){const attempts=all.filter(q=>(q.originalQuizId||q.id)===id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||(a.attempt||1)-(b.attempt||1));if(!attempts.length)continue;
   const latest=attempts.at(-1),answers=Object.values(latest.answers||{});const score=answers.length?Math.round(100*answers.filter(a=>a.correct).length/answers.length)+'%'+(answers.length<latest.questions.length?' (in progress)':''):(!Object.hasOwn(latest,'answers')||latest.legacyAnswerHistory?'Not recorded':'Not answered');
   const original=attempts.find(q=>q.id===id)||attempts[0];groups.push({id,attempts,original,name:original.name||latest.name||'Unnamed test',latest,score});
  }return groups.sort((a,b)=>b.original.createdAt.localeCompare(a.original.createdAt));
 }
 const api={topicsFor,historyGroups};if(typeof module!=='undefined')module.exports=api;else root.RecallViews=api;
})(typeof globalThis!=='undefined'?globalThis:this);
