param([string]$BookPath,[string]$OutputPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[System.IO.Compression.ZipFile]::OpenRead($BookPath)
function ReadXml($name) {
  $entry=$archive.GetEntry($name)
  if(!$entry){return $null}
  $reader=[System.IO.StreamReader]::new($entry.Open())
  try {[xml]$reader.ReadToEnd()} finally {$reader.Dispose()}
}
try {
  $shared=ReadXml 'xl/sharedStrings.xml'
  $strings=@($shared.sst.si|ForEach-Object {$_.InnerText})
  $wb=ReadXml 'xl/workbook.xml'
  $rels=ReadXml 'xl/_rels/workbook.xml.rels'
  $sheets=@(foreach($sheet in $wb.workbook.sheets.sheet){
    $rid=$sheet.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $rel=$rels.Relationships.Relationship|Where-Object {$_.Id -eq $rid}
    $target=if($rel.Target.StartsWith('/')){$rel.Target.TrimStart('/')}else{'xl/'+$rel.Target}
    $xml=ReadXml $target
    $cells=@{}
    foreach($row in $xml.worksheet.sheetData.row){foreach($cell in $row.c){
      $value=[string]$cell.v
      if($cell.t -eq 's'){$value=$strings[[int]$value]}
      if($cell.t -eq 'inlineStr'){$value=$cell.is.InnerText}
      $formula=$null;$sharedId=$null;$sharedRange=$null
      if($cell.f -is [System.Xml.XmlElement]){$formula=$cell.f.InnerText;$sharedId=$cell.f.GetAttribute('si');$sharedRange=$cell.f.GetAttribute('ref')}
      elseif($cell.f){$formula=[string]$cell.f}
      $cells[$cell.r]=@{value=$value;type=[string]$cell.t;style=[string]$cell.s;formula=$formula;sharedId=$sharedId;sharedRange=$sharedRange}
    }}
    @{name=[string]$sheet.name;cells=$cells;merges=@($xml.worksheet.mergeCells.mergeCell|ForEach-Object {$_.ref});columns=$xml.worksheet.cols.OuterXml;rows=@($xml.worksheet.sheetData.row|ForEach-Object {@{r=$_.r;height=$_.ht}})}
  })
  $result=@{sheets=$sheets;styles=(ReadXml 'xl/styles.xml').OuterXml}
  [System.IO.File]::WriteAllText($OutputPath,($result|ConvertTo-Json -Depth 20),[System.Text.UTF8Encoding]::new($false))
}finally{$archive.Dispose()}
