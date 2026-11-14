/* Calculation stays off the interface thread; no data is persisted by this worker. */
importScripts('sales-statistics-engine.js');
self.onmessage=({data})=>{
  try{
    const E=self.AllianceSalesStatisticsEngine,options={catalog:data.catalog,now:new Date(data.now)};
    const current=E.analyse(data.current.records,data.range,{...options,partial:data.current.partial});
    const previous=data.previous?E.analyse(data.previous.records,data.range.previous,{...options,partial:data.previous.partial}):null;
    self.postMessage({id:data.id,value:{current,previous,comparison:previous?E.compare(current,previous):null}});
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
