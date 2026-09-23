// Sube fotos de productos a Supabase Storage en vez de guardarlas incrustadas
// (como texto base64) adentro del bloque de datos de la app. Antes, cada foto
// subida desde el panel quedaba pegada dentro del mismo JSON gigante que
// guarda TODO (productos, categorías, pedidos, clientes del club, etc.), así
// que cuantas más fotos se cargaban, más pesado y lento se ponía CADA
// guardado, aunque no tuviera nada que ver con esa foto.
//
// Ahora cada foto queda en su propio archivo en Supabase Storage, y el
// sistema solo guarda el link (unas pocas decenas de bytes) — igual que ya
// se hacía con las fotos que venían de una URL externa (Unsplash, etc.).
//
// Necesita estas dos variables de entorno (se configuran en Render, no acá):
//   SUPABASE_URL             -> Project URL (Supabase → Project Settings → API)
//   SUPABASE_SERVICE_KEY     -> la clave "service_role" (la secreta, NO la "anon")
// Opcional:
//   SUPABASE_IMAGES_BUCKET   -> nombre del bucket (por defecto: "product-images")
//
// Si estas variables no están configuradas, el panel sigue funcionando como
// antes (guarda la foto incrustada) — así no se rompe nada mientras se hace
// la configuración en Supabase.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET_NAME = process.env.SUPABASE_IMAGES_BUCKET || 'product-images';

const USE_SUPABASE_STORAGE = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY);

let supabase = null;
if (USE_SUPABASE_STORAGE) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('✅ Supabase Storage configurado (bucket: ' + BUCKET_NAME + ').');
} else {
  console.log('ℹ️ Supabase Storage no configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_KEY) — las fotos subidas desde el panel se van a seguir guardando incrustadas.');
}

// Recibe una imagen en formato "data:image/jpeg;base64,...." (la que ya
// arma el panel al comprimir la foto en el navegador) y la sube a Supabase
// Storage. Devuelve la URL pública final para guardar en el producto.
async function uploadProductImage(dataUrl) {
  if (!USE_SUPABASE_STORAGE) {
    throw new Error('Supabase Storage no está configurado en el servidor.');
  }

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) {
    throw new Error('Formato de imagen inválido.');
  }
  const mimeType = match[1];
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');
  const ext = mimeType.split('/')[1] || 'jpg';
  const fileName = `productos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, buffer, { contentType: mimeType, upsert: false });

  if (error) {
    throw new Error('Error al subir la imagen a Supabase Storage: ' + error.message);
  }

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
  return data.publicUrl;
}

module.exports = { uploadProductImage, USE_SUPABASE_STORAGE };
