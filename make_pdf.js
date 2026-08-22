const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const htmlPath = path.join(__dirname, '..', 'MANUAL_CONTINGENCIA_Y_RESPALDOS.html');
const pdfPath = path.join(__dirname, '..', 'MANUAL_CONTINGENCIA_Y_RESPALDOS.pdf');

console.log('📄 Generando PDF del Manual de Contingencia y Respaldos...');

const args = [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--print-to-pdf=${pdfPath}`,
  `file:///${htmlPath.replace(/\\/g, '/')}`
];

execFile(chromePath, args, (err, stdout, stderr) => {
  if (err) {
    console.error('Error al generar PDF:', err);
    return;
  }
  console.log('✅ ¡PDF GENERADO CON ÉXITO EN SU DISCO!');
  console.log('📁 Ubicación:', pdfPath);
});
