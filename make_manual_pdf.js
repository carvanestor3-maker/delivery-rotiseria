const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const htmlPath = path.join(__dirname, 'public', 'manual.html');
const pdfPathRoot = path.join(__dirname, '..', 'MANUAL_MISIONES_Y_FUNCIONES.pdf');
const pdfPathPublic = path.join(__dirname, 'public', 'MANUAL_MISIONES_Y_FUNCIONES.pdf');
const backupDir = path.join(__dirname, '..', 'respaldos_delivery');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}
const pdfPathBackup = path.join(backupDir, 'MANUAL_MISIONES_Y_FUNCIONES.pdf');

console.log('📄 Generando PDF del Manual de Misiones y Funciones...');

const args = [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--print-to-pdf=${pdfPathRoot}`,
  `file:///${htmlPath.replace(/\\/g, '/')}`
];

execFile(chromePath, args, (err) => {
  if (err) {
    console.error('Error al generar PDF con Chrome:', err);
    return;
  }
  
  try {
    fs.copyFileSync(pdfPathRoot, pdfPathPublic);
    fs.copyFileSync(pdfPathRoot, pdfPathBackup);
  } catch (e) {}

  console.log('✅ ¡PDF GENERADO CON ÉXITO EN SU COMPUTADORA!');
  console.log('📁 Ubicación 1:', pdfPathRoot);
  console.log('📁 Ubicación 2:', pdfPathPublic);
  console.log('📁 Ubicación 3:', pdfPathBackup);
});
