/* Business-day ranges use Colombia's clock and exclude the closing instant. */
globalThis.AllianceSalesRange=(()=>{
  const day=86400000,key=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(date),midnight=date=>Date.parse(date+'T00:00:00-05:00');
  function today(shift,now=new Date()){
    const date=key(now),stamp=Number(now),base=midnight(shift?.date),valid=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
    let start=midnight(date),end=start+day,dateFrom=date,dateTo=date;
    if(Number.isFinite(base)&&valid.test(shift?.startTime)&&valid.test(shift?.endTime)&&shift.startTime!==shift.endTime){
      const clock=text=>Number(text.slice(0,2))*60+Number(text.slice(3)),a=clock(shift.startTime),b=clock(shift.endTime),from=base+a*60000,to=base+b*60000+(b<a?day:0);
      if(stamp>=base&&stamp<to){start=from;end=to;dateFrom=shift.date;dateTo=key(new Date(to-1));}
      else if(stamp>=to&&key(new Date(to))===date)start=Math.max(start,to);
    }
    return {dateFrom,dateTo,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString()};
  }
  const matches=(value,filters)=>{const t=Date.parse(value);return Number.isFinite(t)&&(!filters.startAt||t>=Date.parse(filters.startAt))&&(!filters.endAt||t<Date.parse(filters.endAt));};
  return {today,matches};
})();
