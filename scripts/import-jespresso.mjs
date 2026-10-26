// Rebuild the recipe library from the client's original XLSX; no Excel dependency needed.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
const temp=mkdtempSync(join(tmpdir(),'jespresso-'));
try {
  const output=join(temp,'book.json');
  execFileSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/read-costing-workbook.ps1'),'-BookPath',resolve('Recetas Jespresso Oliva.xlsx'),'-OutputPath',output],{windowsHide:true});
  const book=JSON.parse(readFileSync(output,'utf8')),ctx={};
  runInNewContext(readFileSync('operational/jespresso-engine.js','utf8'),ctx);
  const col=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  const colN=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  const templates=[],audit=[];
  for(const sheet of book.sheets){
    const c=sheet.cells,v=(x)=>c[x]?.value??'',num=x=>Number(v(x));
    // Resolve shared formula anchors before reading the presentation's package sizes.
    const anchors={};for(const [ref,cell] of Object.entries(c))if(cell.sharedId&&cell.formula)anchors[cell.sharedId]={ref,formula:cell.formula};
    function formula(ref){const cell=c[ref];if(cell?.formula)return cell.formula;if(!cell?.sharedId)return '';const a=anchors[cell.sharedId];if(!a)throw Error('Missing shared formula '+sheet.name+' '+ref);const dr=Number(ref.match(/\d+/)[0])-Number(a.ref.match(/\d+/)[0]),dc=colN(ref.match(/[A-Z]+/)[0])-colN(a.ref.match(/[A-Z]+/)[0]);return a.formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g,(_,ac,cc,ar,rr)=>ac+col(colN(cc)+(ac?0:dc))+ar+(Number(rr)+(ar?0:dr)));}
    const blocks=sheet.name==='MANTEQUILLA'?[7,14,21,28]:sheet.name==='FRAPUCHINOS'?[7,14]:[7];
    for(const [index,start] of blocks.entries()){
      const C=o=>col(start+o),butter=sheet.name==='MANTEQUILLA',key='excel-'+(templates.length+1),s=JSON.parse(JSON.stringify(ctx.AllianceJespresso.defaults()));
      const title=butter?v(C(2)+'2').trim():sheet.name==='FRAPUCHINOS'?'FRAPUCHINO · '+(index?'Oreo':'Brownie'):sheet.name.trim();
      s.source=sheet.name.trim();s.unforeseenPercent=num(C(1)+'18');s.factorPercent=num(C(1)+'22');s.capitalMode=formula(C(1)+'23')?'daily':'manual';s.capitalPercent=num(C(1)+'23');s.consumptionPercent=num(C(1)+'24');s.ivaPercent=num(C(1)+'25');
      s.date=v(C(5)+'3')?new Date((num(C(5)+'3')-25569)*86400000).toISOString().slice(0,10):'';
      if(butter){s.quantity=num(C(3)+'4');s.management[0].percent=15;s.management[1].percent=10;s.management[2].percent=15;}
      else {s.operating.forEach((e,i)=>{e.amount=num('E'+(i+2));});s.closingDays=num('D11')||26;}
      const ingredients=[],lines=[];
      for(let row=6;row<=16;row++){
        const name=v(C(0)+row).trim();if(!name)continue;
        const I=C(2)+row,J=C(3)+row,K=C(4)+row,L=C(5)+row,rawFormula=formula(L).replace(/\s/g,''),f=rawFormula.replaceAll(K,'K').replaceAll(I,'I').replaceAll(J,'J');
        let quantity=num(I),purchaseQuantity=1,unit=/^m[lL]$/.test(v(J))?'ml':/^gr?$/i.test(v(J))?'g':'unit',manualCost;
        const divisor=f.match(/[KI]\/(\d+(?:\.\d+)?)/);
        if(divisor){purchaseQuantity=Number(divisor[1]);if(unit==='unit')unit='g';}
        else if(f==='K/(I/J)'){purchaseQuantity=num(I);quantity=num(J);unit='g';}
        else if(f==='K*J'||f==='J*K'){quantity=num(J);purchaseQuantity=1;unit='unit';}
        else if(f.includes('K/J')||f.includes('K/J)')){purchaseQuantity=num(J);quantity=f.includes('*I')||f.startsWith('I*')?num(I):1;unit='unit';}
        else if(f==='K'){quantity=quantity>0?quantity:1;unit='unit';}
        else if(!f){manualCost=num(L);quantity=quantity>0?quantity:1;unit='unit';}
        else throw Error('Unmapped formula '+sheet.name+' '+L+': '+rawFormula);
        if(!(quantity>0&&purchaseQuantity>0))throw Error('Missing quantity '+sheet.name+' '+I);
        const id=key+'-i'+row;ingredients.push({id,name,unit,quantity:purchaseQuantity,purchasePrice:num(K),yieldPercent:100,purchaseTaxRate:0,recoverableTax:false});
        const line={ingredientId:id,quantity,unit,stage:sheet.name==='HELADOS'&&row>=12?'portion':'batch'};if(manualCost!==undefined)line.manualCost=manualCost;lines.push(line);
        audit.push({sheet:sheet.name,variant:title,cell:L,formula:rawFormula||null,cached:Number(v(L)),quantity,purchaseQuantity,unit,manualCost});
      }
      const recipe={id:key,name:title,size:'',category:butter?'Mantequillas':'Recetas',output:num(C(5)+'4'),wastePercent:0,minutes:null,monthlyUnits:null,currentPrice:null,targetPercent:0,marginMode:'margin',pricingBasis:'production',channelId:'jespresso-direct',lines,sheet:s};
      templates.push({key,title,ingredients,recipe});
    }
  }
  writeFileSync('operational/jespresso-templates.js','/* Generated from Recetas Jespresso Oliva.xlsx. Run node scripts/import-jespresso.mjs to rebuild. */\nglobalThis.JespressoTemplates = '+JSON.stringify(templates)+';\n');
  writeFileSync('tests/fixtures/jespresso-workbook.json',JSON.stringify({source:'Recetas Jespresso Oliva.xlsx',sheets:book.sheets.map(s=>s.name),rows:audit},null,2)+'\n');
  console.log(`${book.sheets.length} hojas, ${templates.length} recetas, ${audit.length} ingredientes importados.`);
}finally{rmSync(temp,{recursive:true,force:true});}
