const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Carpeta de respaldos en el disco local
const backupDir = path.join(__dirname, '..', 'respaldos_delivery');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Generar nombre de archivo con fecha y hora actual
const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const zipFileName = `backup_rotiseria_${dateStr}.zip`;
const zipPath = path.join(backupDir, zipFileName);

console.log('📦 Generando copia de seguridad del sistema y base de datos...');

try {
  // Usar PowerShell nativo de Windows para comprimir todo el código y la base de datos
  const psCmd = `powershell -Command "Compress-Archive -Path '${__dirname}\\*' -DestinationPath '${zipPath}' -Force"`;
  execSync(psCmd);

  console.log('\n✅ ¡COPIA DE SEGURIDAD GENERADA CON ÉXITO EN SU DISCO RIGIDO!');
  console.log(`📁 Ubicación: ${zipPath}`);
  console.log(`🕒 Fecha: ${new Date().toLocaleString('es-AR')}`);
} catch (err) {
  console.error('⚠️ Error al generar copia de seguridad:', err.message);
}
