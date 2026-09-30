const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const net = require('net');
const fs = require('fs');
const { execSync } = require('child_process');
const db = require('./db');
const dbSuppliers = require('./db_suppliers');
const dbSemi = require('./db_semielaborados');
const dbFacturacion = require('./db_facturacion');
const arcaFacturacion = require('./arca_facturacion');
const storage = require('./storage');

const app = express();

// Render (y la mayoría de los hosting) terminan HTTPS en su propio proxy y
// reenvían HTTP simple hacia adentro. Sin esto, Express nunca ve la conexión
// como segura y la cookie de sesión (cookie.secure=true en producción) no se
// llega a enviar nunca -> login roto en vivo aunque funcione en local.
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// ==========================================
// LOGIN DE PERSONAL (Nivel 1/2) - protege todo el panel interno
// (Admin, Caja, Cocina, Bar, Producción, Portales) dejando públicas
// solo las páginas de pedidos de clientes (/pedidos, /menu, index.html).
// ==========================================
//
// Las sesiones se guardan en la misma base Postgres (tabla "user_sessions",
// se crea sola la primera vez) en vez de quedar solo en la memoria del
// proceso de Node. Esto es clave en el plan Free de Render: cuando no hay
// tráfico un rato, Render "duerme" el servidor y lo reinicia de cero en el
// siguiente pedido — con sesiones en memoria eso borra el login de TODO el
// personal sin aviso (parecía que el PIN "dejaba de funcionar" de golpe).
// Con Postgres, el reinicio no pierde las sesiones activas.
// Si no hay Postgres configurado (por ejemplo corriendo local en una PC sin
// internet), sigue usando el almacenamiento en memoria de express-session
// por defecto, como antes.
let sessionStore = undefined;
if (db.USE_POSTGRES && db.pool) {
  const pgSession = require('connect-pg-simple')(session);
  sessionStore = new pgSession({
    pool: db.pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    // BUG REAL REPORTADO: si se dejaba una pantalla del panel abierta (ej.
    // cargando una producción) sin tocar nada por un rato largo, al rato
    // tiraba "No autorizado. Iniciá sesión en el panel interno." aunque la
    // pestaña nunca se hubiera cerrado. Causa: como la cookie de sesión NO
    // tiene maxAge (a propósito, ver más abajo), connect-pg-simple usaba su
    // propio "ttl" por defecto de solo 1 día de INACTIVIDAD para borrar la
    // sesión del lado del servidor - algo fácil de superar en un local que
    // trabaja 24hs y puede quedar una pantalla sin usarse un buen rato. Se
    // sube ese ttl a 7 días: la sesión del navegador se sigue borrando sola
    // al cerrar el navegador del todo (eso no cambia), pero el servidor ya
    // no "olvida" una sesión todavía abierta tan rápido.
    ttl: 60 * 60 * 24 * 7
  });
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'rotiseria-secreto-cambiar-en-render',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
    // A PROPÓSITO sin maxAge: es lo que hace que sea una cookie "de sesión
    // del navegador" de verdad. Antes tenía maxAge de 30 días, y por eso
    // cerrabas la app y al volver a abrirla seguías adentro sin que pida
    // PIN — quedaba guardada en el navegador todo ese tiempo. Sin maxAge,
    // el navegador la borra sola al cerrarse del todo, así que la próxima
    // vez que abras el panel va a pedir PIN de nuevo.
  }
}));

const STAFF_L1_PAGES = ['/caja', '/caja.html', '/cocina', '/cocina.html', '/bar', '/bar.html', '/produccion', '/produccion.html', '/portales', '/portales.html', '/manual.html'];
const STAFF_L2_PAGES = ['/admin', '/admin.html'];
const STAFF_L2_API_PREFIXES = ['/api/admin', '/api/facturacion'];
const STAFF_L1_API_PREFIXES = ['/api/cash', '/api/production', '/api/stock', '/api/pos', '/api/bar', '/api/attendance'];

function requiredStaffLevelFor(req) {
  const p = req.path;
  if (STAFF_L2_PAGES.includes(p)) return 2;
  if (STAFF_L1_PAGES.includes(p)) return 1;
  // Gestión de personal y claves PIN: acá se ve y se cambia la clave
  // maestra y las claves de cada empleado, así que hace falta sesión de
  // Nivel 3 desde el propio login (no solo Nivel 2), además del PIN que ya
  // se pide para guardar/borrar. Si no, cualquier Encargado (Nivel 2) podía
  // ver las claves de todo el personal con solo abrir la pestaña.
  if (p === '/api/admin/users' || p.startsWith('/api/admin/users/')) return 3;
  if (p === '/api/admin/master-pin') return 3;
  // Cuentas Corrientes (Fiado): nombre, DNI, teléfono y saldo de cada
  // cliente. Antes el GET no pedía nada más que ser Nivel 2, así que
  // cualquier Encargado podía ver todo el listado con solo abrir la
  // pestaña. Ahora hace falta sesión de Nivel 3 (Gerente/Dueño).
  if (p === '/api/admin/accounts' || p.startsWith('/api/admin/accounts/')) return 3;
  // Bitácora de Auditoría: ya pedía un PIN de Nivel 3 aparte para mostrar
  // el contenido, pero la pestaña en sí se podía abrir con Nivel 2. Ahora
  // hace falta sesión de Nivel 3 para llegar siquiera a la pestaña.
  if (p === '/api/admin/audit-logs') return 3;
  // Costos & Rentabilidad de Producción (fichas técnicas / escandallos de
  // cada plato): expone costos y márgenes del negocio, exclusivo Nivel 3.
  if (p === '/api/admin/recipes' || p.startsWith('/api/admin/recipes/')) return 3;
  if (STAFF_L2_API_PREFIXES.some(prefix => p.startsWith(prefix))) return 2;
  if (STAFF_L1_API_PREFIXES.some(prefix => p.startsWith(prefix))) return 1;
  if (p === '/api/verify-pin') return 1;
  if (p === '/api/orders') return req.method === 'POST' ? 0 : 1;
  if (p.startsWith('/api/orders/')) return 1;
  // Ajustes Generales (datos fiscales, WhatsApp, impresora, costo de envío,
  // etc.): solo lo usa la pestaña de Ajustes de admin.html, así que pasa a
  // ser exclusivo de Nivel 3 igual que el resto de pestañas sensibles.
  if (p === '/api/settings') return 3;
  return 0;
}

app.use((req, res, next) => {
  const requiredLevel = requiredStaffLevelFor(req);
  if (requiredLevel === 0) return next();
  const sessionLevel = (req.session && req.session.staffLevel) || 0;
  if (sessionLevel >= requiredLevel) return next();
  const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
  if (wantsHtml) {
    return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return res.status(401).json({ success: false, error: 'No autorizado. Iniciá sesión en el panel interno.', session_expired: true });
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { pin } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN incorrecto.' });
    }
    req.session.staffLevel = auth.user.level;
    req.session.staffName = auth.user.name;
    res.json({ success: true, name: auth.user.name, level: auth.user.level });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => res.json({ success: true }));
  } else {
    res.json({ success: true });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.staffLevel) {
    res.json({ success: true, name: req.session.staffName, level: req.session.staffLevel });
  } else {
    res.json({ success: false });
  }
});

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Ruta limpia /menu → sirve menu.html (para linkear desde Google Maps)
app.get('/menu', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

// Ruta /pedidos → sirve index.html (para Google Ads)
app.get('/pedidos', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io conexiones
io.on('connection', (socket) => {
  console.log('⚡ Nuevo cliente conectado:', socket.id);
});

function getSettingsMap() {
  const store = db.getStore();
  return store.settings || {};
}

// HELPER PRINCIPAL: VERIFICACIÓN DE PIN POR USUARIO Y NIVEL
function verifyUserPin(inputPin, requiredLevel = 2) {
  const store = db.getStore();
  const strPin = String(inputPin || '').trim();

  if (!strPin) return { isValid: false, user: null };

  const settings = getSettingsMap();
  const encargadoPin = settings.encargado_pin || '2222';
  const adminPin = settings.admin_pin || '9999';

  // La clave maestra de Nivel 3 (Gerente/Dueño) se revisa PRIMERO, antes que
  // los empleados nombrados de "Personal, Usuarios & PINs". Es la clave de
  // mayor privilegio del sistema: si por casualidad coincide con el PIN
  // individual de algún empleado cargado ahí, quien la escribe tiene que
  // entrar igual como Nivel 3, sin quedar "tapado" por el nivel más bajo de
  // ese empleado. Antes se revisaban primero los empleados nombrados, y una
  // coincidencia de números dejaba a la clave maestra sin efecto.
  if (strPin === String(adminPin)) {
    return { isValid: true, user: { id: 0, name: 'Gerente General / Dueño', level: 3 } };
  }

  const users = store.users || [];
  const foundUser = users.find(u => u.active !== 0 && String(u.pin).trim() === strPin);

  if (foundUser) {
    if (foundUser.level >= requiredLevel) {
      return { isValid: true, user: foundUser };
    } else {
      return { isValid: false, user: foundUser, levelTooLow: true };
    }
  }

  // Ya se revisó adminPin arriba, así que acá solo puede coincidir con la
  // clave maestra de Nivel 2 (que nunca alcanza para un requiredLevel 3).
  if (strPin === String(encargadoPin)) {
    return { isValid: true, user: { id: 0, name: 'Encargado de Turno', level: 2 } };
  }

  return { isValid: false, user: null };
}

// DESCARGA DIRECTA DE COPIA DE SEGURIDAD ZIP (REQUERIDO NIVEL 3)
app.get('/api/admin/backup/download', (req, res) => {
  try {
    const pin = req.query.pin;
    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Se requiere PIN Nivel 3 para descargar copias de seguridad.' });
    }

    const backupDir = path.join(__dirname, '..', 'respaldos_delivery');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFileName = `backup_rotiseria_${dateStr}.zip`;
    const zipPath = path.join(backupDir, zipFileName);

    const psCmd = `powershell -Command "Compress-Archive -Path '${__dirname}\\*' -DestinationPath '${zipPath}' -Force"`;
    execSync(psCmd);

    res.download(zipPath, zipFileName, (err) => {
      if (err) console.error('Error al enviar archivo zip:', err);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// EXPORTACIÓN SEGURA DE DATOS EN JSON (funciona en cualquier plataforma, incluida la nube/Render,
// a diferencia del backup ZIP de arriba que depende de PowerShell y solo funciona en Windows)
app.get('/api/admin/raw-export', (req, res) => {
  try {
    const pin = req.query.pin;
    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Se requiere PIN Nivel 3.' });
    }
    const store = db.getStore();
    const fileName = `respaldo_datos_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.json(store);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTA API DE VERIFICACIÓN DE PIN (PÚBLICA CON RETORNO DE NOMBRE DE USUARIO)
app.post('/api/verify-pin', (req, res) => {
  try {
    const { pin, level } = req.body;
    const reqLevel = parseInt(level || 2);
    const result = verifyUserPin(pin, reqLevel);

    if (result.isValid) {
      return res.json({ 
        success: true, 
        authorized: true, 
        user_name: result.user.name, 
        user_level: result.user.level 
      });
    } else {
      const errMsg = result.levelTooLow 
        ? `Acceso denegado: El usuario "${result.user.name}" posee Nivel ${result.user.level} y esta acción requiere Nivel ${reqLevel}.`
        : `Clave PIN incorrecta para Nivel ${reqLevel}.`;
      return res.status(401).json({ success: false, authorized: false, error: errMsg });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GESTIÓN DE USUARIOS / PERSONAL NOMBRADO (REQUERIDO NIVEL 3)
app.get('/api/admin/users', (req, res) => {
  try {
    const store = db.getStore();
    res.json({ success: true, users: store.users || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/users', (req, res) => {
  try {
    const { id, name, pin, level, admin_pin } = req.body;

    const auth = verifyUserPin(admin_pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La gestión de personal requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    if (!name || !pin || !level) {
      return res.status(400).json({ success: false, error: 'Nombre, PIN y Nivel son obligatorios.' });
    }

    const store = db.getStore();
    if (!store.users) store.users = [];

    const numLevel = parseInt(level);
    const strPin = String(pin).trim();

    const existingPinUser = store.users.find(u => String(u.pin).trim() === strPin && u.id !== parseInt(id || 0));
    if (existingPinUser) {
      return res.status(400).json({ success: false, error: `La clave PIN "${strPin}" ya pertenece al usuario "${existingPinUser.name}". Debe asignar una clave única por personal.` });
    }

    if (id) {
      const u = store.users.find(usr => usr.id === parseInt(id));
      if (u) {
        u.name = name;
        u.pin = strPin;
        u.level = numLevel;
      }
    } else {
      const nextId = store.users.length > 0 ? Math.max(...store.users.map(usr => usr.id)) + 1 : 1;
      store.users.push({
        id: nextId,
        name,
        pin: strPin,
        level: numLevel,
        active: 1
      });
    }

    db.saveStore();
    res.json({ success: true, users: store.users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { admin_pin } = req.body;

    const auth = verifyUserPin(admin_pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Se requiere PIN Nivel 3.' });
    }

    const store = db.getStore();
    store.users = (store.users || []).filter(u => u.id !== parseInt(id));
    db.saveStore();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// APERTURA DE TURNO DE CAJA POR NÚMERO DE CAJA, CAJERO ASIGNADO Y AUTORIZANTE (REQUERIDO NIVEL 2 O 3)
app.post('/api/cash/shift/open', async (req, res) => {
  try {
    const { box_number, cashier_name, initial_cash, shift_type, pin } = req.body;
    const numBox = parseInt(box_number || 1);
    const strShiftType = shift_type || 'comandas'; // 'comandas' | 'pre_packaged' | 'weighed_food'

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN personal no válido o no registrado.' });
    }

    const strCashierName = (cashier_name || auth.user.name).trim();

    const store = db.getStore();
    if (!store.cash_shifts) store.cash_shifts = [];

    // 1. Regla Nivel 1: Un operario Nivel 1 no puede tener 2 cajas abiertas simultáneamente con su clave
    if (auth.user.level === 1) {
      const activeShiftByUser = store.cash_shifts.find(s => s.status === 'open' && s.user_id === auth.user.id);
      if (activeShiftByUser) {
        return res.status(400).json({ 
          success: false, 
          error: `⚠️ EL OPERARIO "${auth.user.name}" (Nivel 1) YA TIENE LA CAJA N° ${activeShiftByUser.box_number} ABIERTA. Un operario de Nivel 1 no puede abrir dos cajas simultáneamente.` 
        });
      }
    }

    // 2. Regla General (Nivel 1, 2 o 3): El nombre del cajero asignado NO se puede repetir en 2 cajas abiertas simultáneamente
    const activeShiftWithSameCashier = store.cash_shifts.find(s => s.status === 'open' && (s.cashier_name || '').toLowerCase() === strCashierName.toLowerCase());
    if (activeShiftWithSameCashier) {
      return res.status(400).json({ 
        success: false, 
        error: `⚠️ EL CAJERO/A "${strCashierName}" YA ESTÁ ASIGNADO/A A LA CAJA N° ${activeShiftWithSameCashier.box_number} ACTUALMENTE ABIERTA. No se puede repetir el nombre del cajero en dos cajas abiertas.` 
      });
    }

    // 3. Regla Número de Caja: La caja N° numBox no puede ser reabierta sin cerrar la previa
    const activeShiftOnBox = store.cash_shifts.find(s => s.status === 'open' && (s.box_number || 1) === numBox);
    if (activeShiftOnBox) {
      return res.status(400).json({ 
        success: false, 
        error: `⚠️ LA CAJA N° ${numBox} YA ESTÁ ABIERTA: Fue habilitada por "${activeShiftOnBox.opened_by}" para el cajero "${activeShiftOnBox.cashier_name || 'Sin asignar'}". Elija otro número de caja o cierre la Caja N° ${numBox} previa.` 
      });
    }

    const nextId = store.cash_shifts.length > 0 ? Math.max(...store.cash_shifts.map(s => s.id)) + 1 : 1;
    const newShift = {
      id: nextId,
      box_number: numBox,
      user_id: auth.user.id,
      cashier_name: strCashierName,
      shift_type: strShiftType,
      opened_at: new Date().toISOString(),
      closed_at: null,
      initial_cash: parseFloat(initial_cash || 0),
      final_cash: null,
      status: 'open',
      opened_by: `${auth.user.name} (Nivel ${auth.user.level})`
    };

    store.cash_shifts.unshift(newShift);
    // Guardado CON confirmación: la apertura de caja registra el efectivo
    // inicial declarado por el cajero -> si no queda grabado, tiene que
    // saberse antes de seguir cobrando, no perderse en silencio.
    await db.saveStoreAndConfirm();
    io.emit('cash_shift_updated');

    res.json({ success: true, shift: newShift, user_name: auth.user.name, cashier_name: strCashierName, box_number: numBox });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CIERRE DE TURNO DE CAJA POR NÚMERO DE CAJA Y USUARIO INDIVIDUAL (REQUERIDO NIVEL 2 O 3)
app.post('/api/cash/shift/close', async (req, res) => {
  try {
    const { box_number, shift_id, final_cash, pin } = req.body;
    const numBox = box_number ? parseInt(box_number) : null;
    const shiftId = shift_id ? parseInt(shift_id) : null;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ 
        success: false, 
        error: '⚠️ Acceso Denegado: La clave PIN ingresada no es válida o no está registrada. Si el cajero es un Aprendiz (sin PIN de Nivel 1), el cierre de caja debe ser realizado o autorizado por un Encargado (Nivel 2) o Gerente (Nivel 3).' 
      });
    }

    const store = db.getStore();
    if (!store.cash_shifts) store.cash_shifts = [];

    let activeShift = null;
    if (shiftId) {
      activeShift = store.cash_shifts.find(s => s.id === shiftId && s.status === 'open');
    } else if (numBox) {
      activeShift = store.cash_shifts.find(s => s.status === 'open' && (s.box_number || 1) === numBox);
    } else {
      activeShift = store.cash_shifts.find(s => s.status === 'open');
    }

    if (!activeShift) {
      return res.status(400).json({ success: false, error: numBox ? `La Caja N° ${numBox} no está abierta o ya fue cerrada.` : 'No hay ninguna caja abierta para cerrar.' });
    }

    activeShift.closed_at = new Date().toISOString();
    activeShift.final_cash = parseFloat(final_cash || 0);
    activeShift.status = 'closed';
    activeShift.closed_by = `${auth.user.name} (Nivel ${auth.user.level})`;

    // REGLA DE NEGOCIO DEL BAR:
    // Si se cierra la última caja abierta de la sucursal, el Bar se cierra automáticamente.
    const remainingOpenCashShifts = store.cash_shifts.filter(s => s.status === 'open');
    let barAutoClosed = false;
    if (remainingOpenCashShifts.length === 0 && store.bar_shifts) {
      const openBarShift = store.bar_shifts.find(b => b.status === 'open');
      if (openBarShift) {
        openBarShift.status = 'closed';
        openBarShift.closed_at = new Date().toISOString();
        openBarShift.closed_by = `Cierre Automático (Caja N° ${activeShift.box_number || 1} cerrada por ${auth.user.name})`;
        barAutoClosed = true;
        io.emit('bar_shift_updated', openBarShift);
      }
    }

    // Guardado CON confirmación: el cierre de caja registra el efectivo
    // final contado -> es el dato que se usa para cuadrar la caja, no puede
    // quedar en el aire si la base no confirmó el guardado.
    await db.saveStoreAndConfirm();
    io.emit('cash_shift_updated');

    res.json({ success: true, shift: activeShift, user_name: auth.user.name, box_number: activeShift.box_number || 1, bar_auto_closed: barAutoClosed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// BITÁCORA DE AUDITORÍA Y FACTURACIÓN MULTI-PERÍODO (EXCLUSIVO NIVEL 3 - GERENTE / DUEÑO)
app.post('/api/admin/audit-logs', (req, res) => {
  try {
    const { pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La Bitácora de Auditoría es de acceso exclusivo para Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const now = new Date();

    const validOrders = store.orders.filter(o => o.status !== 'cancelado');

    function calculateFinancialMetrics(days) {
      const cutoff = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
      const periodOrders = validOrders.filter(o => new Date(o.created_at) >= cutoff);

      let total = 0;
      let cash = 0;
      let card = 0;
      let digital = 0;
      let cc = 0;

      periodOrders.forEach(o => {
        total += o.total;
        if (o.payment_method === 'Efectivo') cash += o.total;
        else if (o.payment_method.includes('Tarjeta') || o.payment_method.toLowerCase().includes('posnet')) card += o.total;
        else if (o.payment_method.includes('Cuenta Corriente')) cc += o.total;
        else digital += o.total;
      });

      return {
        count: periodOrders.length,
        total_sales: total,
        cash_sales: cash,
        card_sales: card,
        digital_sales: digital,
        cc_sales: cc
      };
    }

    const billing = {
      diario: calculateFinancialMetrics(1),
      semanal: calculateFinancialMetrics(7),
      quincenal: calculateFinancialMetrics(15),
      mensual: calculateFinancialMetrics(30)
    };

    res.json({
      success: true,
      audited_by_user: auth.user.name,
      billing,
      stock_entries: store.stock_entries || [],
      stock_adjustments: store.stock_adjustments || [],
      account_payments: store.account_payments || [],
      cash_shifts: store.cash_shifts || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CONCILIAR / AJUSTAR STOCK REAL VS VIRTUAL CON AUDITORÍA DE USUARIO (REQUERIDO NIVEL 3)
app.post('/api/admin/stock/adjust', (req, res) => {
  try {
    const { raw_material_id, real_stock, reason, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La Conciliación de Stock requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const rawMat = store.raw_materials.find(m => m.id === parseInt(raw_material_id));
    if (!rawMat) {
      return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
    }

    const oldStock = rawMat.current_stock || 0;
    const newStock = parseFloat(real_stock || 0);
    const diff = newStock - oldStock;

    rawMat.current_stock = newStock;

    if (!store.stock_adjustments) store.stock_adjustments = [];
    const nextId = store.stock_adjustments.length > 0 ? Math.max(...store.stock_adjustments.map(a => a.id)) + 1 : 1;
    store.stock_adjustments.unshift({
      id: nextId,
      date: new Date().toISOString(),
      raw_material_name: rawMat.name,
      unit: rawMat.unit,
      old_stock: oldStock,
      new_stock: newStock,
      difference: diff,
      reason: reason || 'Conciliación de inventario físico real',
      registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
    });

    db.saveStore();
    io.emit('stock_updated');

    res.json({
      success: true,
      raw_material_name: rawMat.name,
      old_stock: oldStock,
      new_stock: newStock,
      difference: diff,
      user_name: auth.user.name
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================================================
// AYUDANTES COMPARTIDOS: descontar / revertir los componentes de la Ficha
// Técnica de un producto (plato o trago) cuando se vende o se produce. Cada
// componente puede ser un Insumo Genérico directo (vive en raw_materials,
// acá mismo en la base principal) o un Pre-Armado / Semielaborado (una
// preparación intermedia con su propio stock, hecha a su vez de insumos, y
// que vive en su base separada db_semielaborados.js). Se centraliza acá
// para no repetir esta lógica de "¿de qué tipo es este ingrediente?" en
// cada uno de los puntos donde se vende o produce un plato/trago.
// ==========================================================================
async function deductProductRecipeComponents(store, productId, qtyMultiplier) {
  const recipes = (store.product_recipes || []).filter(r => r.product_id === productId);
  const deducted = [];
  let totalCost = 0;

  for (const r of recipes) {
    const qty = (r.qty_per_portion || 0) * qtyMultiplier;
    if (!(qty > 0)) continue;

    if (r.semi_elaborado_id) {
      const semi = await dbSemi.deductSemiStock(r.semi_elaborado_id, qty);
      if (semi) {
        const unitCost = parseFloat(semi.cost_per_unit || 0);
        const cost = parseFloat((qty * unitCost).toFixed(2));
        totalCost += cost;
        deducted.push({ tipo: 'Pre-Armado', material_name: semi.name, code: semi.code, unit: semi.unit, qty_deducted: qty, cost_per_unit: unitCost, total_cost: cost, remaining_stock: semi.current_stock });
      }
    } else if (r.raw_material_id) {
      const mat = (store.raw_materials || []).find(m => m.id === r.raw_material_id);
      if (mat) {
        mat.current_stock = parseFloat(Math.max(0, (mat.current_stock || 0) - qty).toFixed(4));
        const unitCost = parseFloat(mat.cost_per_unit || mat.cost || 0);
        const cost = parseFloat((qty * unitCost).toFixed(2));
        totalCost += cost;
        deducted.push({ tipo: 'Insumo', material_name: mat.name, code: mat.code, unit: mat.unit, qty_deducted: qty, cost_per_unit: unitCost, total_cost: cost, remaining_stock: mat.current_stock });
      }
    }
  }

  return { deducted, totalCost };
}

async function restoreProductRecipeComponents(store, productId, qtyMultiplier) {
  const recipes = (store.product_recipes || []).filter(r => r.product_id === productId);

  for (const r of recipes) {
    const qty = (r.qty_per_portion || 0) * qtyMultiplier;
    if (!(qty > 0)) continue;

    if (r.semi_elaborado_id) {
      await dbSemi.restoreSemiStock(r.semi_elaborado_id, qty);
    } else if (r.raw_material_id) {
      const mat = (store.raw_materials || []).find(m => m.id === r.raw_material_id);
      if (mat) mat.current_stock = parseFloat(((mat.current_stock || 0) + qty).toFixed(4));
    }
  }
}

// REGISTRAR PRODUCCIÓN EN LOTE CON NOMBRE DE ENCARGADO (Mise en place - Requiere Nivel 2)
app.post('/api/production/register', async (req, res) => {
  try {
    const { product_id, portions, pin } = req.body;
    const pid = parseInt(product_id);
    const qtyPortions = parseFloat(portions || 0);

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) incorrecto' });
    }

    if (!pid || qtyPortions <= 0) {
      return res.status(400).json({ success: false, error: 'Producto y cantidad de porciones producidas son obligatorios' });
    }

    const store = db.getStore();
    const prod = store.products.find(p => p.id === pid);
    if (!prod) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const { deducted } = await deductProductRecipeComponents(store, pid, qtyPortions);
    const discountedMaterials = deducted.map(d => `${d.material_name}: -${d.qty_deducted.toFixed(2)}${d.unit}`);

    db.saveStore();
    io.emit('stock_updated');

    res.json({
      success: true,
      product_name: prod.name,
      portions: qtyPortions,
      discounted: discountedMaterials,
      user_name: auth.user.name
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ingreso de Mercadería al Stock General con Nombre de Usuario (Requiere PIN Nivel 2)
app.post('/api/stock/entry', async (req, res) => {
  try {
    const { pin, supplier_id, raw_material_id, quantity, unit_cost, notes } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) incorrecto' });
    }

    const store = db.getStore();
    const rawMat = store.raw_materials.find(m => m.id === parseInt(raw_material_id));
    if (!rawMat) {
      return res.status(404).json({ success: false, error: 'Insumo de materia prima no encontrado' });
    }

    const qtyAdd = parseFloat(quantity || 0);
    if (qtyAdd <= 0) {
      return res.status(400).json({ success: false, error: 'La cantidad ingresada debe ser mayor a 0' });
    }

    rawMat.current_stock = (rawMat.current_stock || 0) + qtyAdd;

    // Los proveedores viven en su propia base separada (db_suppliers.js).
    const supplier = supplier_id ? await dbSuppliers.getSupplier(parseInt(supplier_id)) : null;

    const nextId = store.stock_entries.length > 0 ? Math.max(...store.stock_entries.map(e => e.id)) + 1 : 1;
    store.stock_entries.unshift({
      id: nextId,
      date: new Date().toISOString(),
      supplier_name: supplier ? supplier.name : 'Proveedor General',
      raw_material_name: rawMat.name,
      unit: rawMat.unit,
      quantity: qtyAdd,
      unit_cost: parseFloat(unit_cost || 0),
      total_cost: qtyAdd * parseFloat(unit_cost || 0),
      notes: notes || '',
      registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
    });

    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, raw_material: rawMat, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Guardar Insumo / Materia Prima (Requiere PIN Nivel 2)
app.post('/api/admin/materials', (req, res) => {
  try {
    const { id, code, name, unit, min_stock, current_stock, cost_per_unit, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const strCode = (code || '').trim().toUpperCase();
    if (!strCode) {
      return res.status(400).json({ success: false, error: '⚠️ El Código / SKU del insumo es obligatorio. Escanea el código de barras de fábrica o presiona el botón ⚡ Auto.' });
    }

    const store = db.getStore();

    const dupMatCode = store.raw_materials.find(m => m.code && m.code.toUpperCase() === strCode && m.id !== parseInt(id || 0));
    if (dupMatCode) {
      return res.status(400).json({ success: false, error: `⚠️ CÓDIGO SKU DUPLICADO: El código "${strCode}" ya está asignado al insumo genérico "${dupMatCode.name}".` });
    }

    const dupMatName = store.raw_materials.find(m => m.name && m.name.trim().toLowerCase() === name.trim().toLowerCase() && m.id !== parseInt(id || 0));
    if (dupMatName) {
      return res.status(400).json({ success: false, error: `⚠️ INSUMO DUPLICADO: Ya existe un insumo genérico registrado con el nombre "${dupMatName.name}".` });
    }
    if (id) {
      const mat = store.raw_materials.find(m => m.id === parseInt(id));
      if (mat) {
        mat.code = strCode;
        mat.name = name;
        mat.unit = unit || 'kg';
        mat.min_stock = parseFloat(min_stock || 5);
        if (current_stock !== undefined) mat.current_stock = parseFloat(current_stock);
        if (cost_per_unit !== undefined && cost_per_unit !== '') mat.cost_per_unit = parseFloat(cost_per_unit);
      }
    } else {
      const nextId = store.raw_materials.length > 0 ? Math.max(...store.raw_materials.map(m => m.id)) + 1 : 1;
      store.raw_materials.push({
        id: nextId,
        code: strCode,
        name,
        unit: unit || 'kg',
        current_stock: parseFloat(current_stock || 0),
        min_stock: parseFloat(min_stock || 5),
        cost_per_unit: parseFloat(cost_per_unit || 0)
      });
    }
    db.saveStore();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================================================
// PRE-ARMADOS / SEMIELABORADOS: BASE DE DATOS SEPARADA (db_semielaborados.js)
// (salsas, rellenos, jarabes, mezclas base para bebidas o comidas: se
// preparan a partir de Insumos Genéricos y quedan con SU PROPIO stock, para
// después poder usarse como un componente más dentro de la Ficha Técnica de
// un plato o trago más complejo - ver /api/admin/recipes/save)
// ==========================================================================

// Guardar Pre-Armado (alta o edición del catálogo) - Requiere PIN Nivel 2
app.post('/api/admin/semi-elaborados', async (req, res) => {
  try {
    const { id, code, name, unit, min_stock, current_stock, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const strCode = (code || '').trim().toUpperCase();
    if (!strCode) {
      return res.status(400).json({ success: false, error: '⚠️ El Código / SKU del pre-armado es obligatorio. Presioná el botón ⚡ Auto.' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: '⚠️ El nombre del pre-armado es obligatorio.' });
    }

    const editId = id ? parseInt(id) : null;
    const dupCode = await dbSemi.findSemiElaboradoByCode(strCode, editId);
    if (dupCode) {
      return res.status(400).json({ success: false, error: `⚠️ CÓDIGO SKU DUPLICADO: El código "${strCode}" ya está asignado al pre-armado "${dupCode.name}".` });
    }
    const dupName = await dbSemi.findSemiElaboradoByName(name, editId);
    if (dupName) {
      return res.status(400).json({ success: false, error: `⚠️ PRE-ARMADO DUPLICADO: Ya existe un pre-armado registrado con el nombre "${dupName.name}".` });
    }

    let semi;
    if (editId) {
      semi = await dbSemi.updateSemiElaborado(editId, { code: strCode, name, unit, min_stock, current_stock });
      if (!semi) {
        return res.status(404).json({ success: false, error: 'Pre-armado no encontrado.' });
      }
    } else {
      semi = await dbSemi.createSemiElaborado({ code: strCode, name, unit, min_stock, current_stock });
    }

    io.emit('stock_updated');
    res.json({ success: true, semi_elaborado: semi, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Guardar la Ficha Técnica de UN Pre-Armado (de qué insumos genéricos está
// hecho y en qué cantidad, por cada unidad que se produce) - Requiere Nivel 2
app.post('/api/admin/semi-elaborados/:id/recipe', async (req, res) => {
  try {
    const { ingredients, pin } = req.body;
    const semiId = parseInt(req.params.id);

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const semi = await dbSemi.getSemiElaborado(semiId);
    if (!semi) {
      return res.status(404).json({ success: false, error: 'Pre-armado no encontrado.' });
    }

    const saved = await dbSemi.saveSemiElaboradoRecipe(semiId, ingredients);
    io.emit('stock_updated');
    res.json({ success: true, semi_elaborado_id: semiId, ingredients: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cargar una Tanda de Producción de un Pre-Armado: descuenta los insumos
// genéricos de la base principal según su Ficha Técnica, calcula el costo
// real de esa tanda, y le suma el stock resultante al Pre-Armado (con su
// costo promedio ponderado actualizado) - Requiere Nivel 1, 2 o 3
app.post('/api/production/semi-add', async (req, res) => {
  try {
    const { semi_elaborado_id, quantity, notes, operator_name, pin } = req.body;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN personal de operario o personal registrado (Nivel 1, 2 o 3) requerido' });
    }

    const semiId = parseInt(semi_elaborado_id);
    const qtyAdd = parseFloat(quantity || 0);
    if (!semiId || qtyAdd <= 0) {
      return res.status(400).json({ success: false, error: 'Pre-armado y cantidad producida son obligatorios' });
    }

    const semi = await dbSemi.getSemiElaborado(semiId);
    if (!semi) {
      return res.status(404).json({ success: false, error: 'Pre-armado no encontrado' });
    }

    const store = db.getStore();
    const recipeRows = (await dbSemi.listAllSemiElaboradoRecipes()).filter(r => r.semi_elaborado_id === semiId);

    if (recipeRows.length === 0) {
      return res.status(400).json({ success: false, error: `⚠️ "${semi.name}" todavía no tiene Ficha Técnica cargada (no se sabe de qué insumos está hecho). Cargala primero.` });
    }

    const deductedMaterials = [];
    let rawMaterialCostTotal = 0;

    recipeRows.forEach(r => {
      const mat = (store.raw_materials || []).find(m => m.id === r.raw_material_id);
      if (mat) {
        const totalDeduct = parseFloat((r.qty_per_unit * qtyAdd).toFixed(4));
        const unitCost = parseFloat(mat.cost_per_unit || mat.cost || 0);
        const matCost = parseFloat((totalDeduct * unitCost).toFixed(2));
        rawMaterialCostTotal += matCost;

        mat.current_stock = parseFloat(Math.max(0, (mat.current_stock || 0) - totalDeduct).toFixed(4));
        deductedMaterials.push({
          material_name: mat.name,
          code: mat.code,
          unit: mat.unit,
          qty_deducted: totalDeduct,
          cost_per_unit: unitCost,
          total_cost: matCost,
          remaining_stock: mat.current_stock
        });
      }
    });

    db.saveStore();

    const { semi: updatedSemi, entry } = await dbSemi.registerProduction({
      semiElaboradoId: semiId,
      quantity: qtyAdd,
      deductedMaterials,
      rawMaterialCostTotal,
      notes,
      operatorName: operator_name ? String(operator_name).trim() : auth.user.name,
      registeredBy: `${auth.user.name} (Nivel ${auth.user.level})`
    });

    io.emit('stock_updated');

    res.json({ success: true, semi_elaborado: updatedSemi, entry, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// PROVEEDORES, PRECIOS & COMPRAS: BASE DE DATOS SEPARADA (db_suppliers.js)
// (los productos de cada proveedor se vinculan a un insumo ya cargado en
// Administración, solo para poder comparar precios/disponibilidad - nunca
// reemplaza ni se mezcla con la lista de insumos, y vive en sus propias
// tablas/archivo, aparte del registro único del resto del sistema)
// ==========================================

// Guardar Proveedor (alta o edición, datos completos) - Requiere PIN Nivel 2
app.post('/api/admin/suppliers', async (req, res) => {
  try {
    const { id, name, cuit, phone, email, address, payment_terms, notes, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const strName = (name || '').trim();
    if (!strName) {
      return res.status(400).json({ success: false, error: '⚠️ El nombre del proveedor es obligatorio.' });
    }

    const idNum = parseInt(id || 0);
    const dupSupplier = await dbSuppliers.findSupplierByName(strName, idNum);
    if (dupSupplier) {
      return res.status(400).json({ success: false, error: `⚠️ PROVEEDOR DUPLICADO: Ya existe un proveedor registrado con el nombre "${dupSupplier.name}".` });
    }

    const payload = { name: strName, cuit, phone, email, address, payment_terms, notes };

    if (idNum) {
      const updated = await dbSuppliers.updateSupplier(idNum, payload);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Proveedor no encontrado.' });
      }
    } else {
      await dbSuppliers.createSupplier(payload);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Eliminar Proveedor - Requiere PIN Nivel 2 (bloqueado si ya tiene compras registradas)
app.delete('/api/admin/suppliers/:id', async (req, res) => {
  try {
    const { pin } = req.body;
    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const supId = parseInt(req.params.id);

    const tienePurchases = await dbSuppliers.supplierHasPurchases(supId);
    if (tienePurchases) {
      return res.status(400).json({ success: false, error: '⚠️ No se puede eliminar: este proveedor tiene compras registradas en el historial. Simplemente dejá de cargarle productos o compras nuevas.' });
    }

    const ok = await dbSuppliers.deleteSupplier(supId);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Proveedor no encontrado.' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Guardar Producto de Proveedor: precio y disponibilidad, vinculado a un
// insumo genérico ya cargado - Requiere PIN Nivel 2
app.post('/api/admin/supplier-products', async (req, res) => {
  try {
    const { id, supplier_id, raw_material_id, product_name, unit_price, code, availability, lead_time, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const store = db.getStore();
    const supId = parseInt(supplier_id);
    const matId = parseInt(raw_material_id);
    const price = parseFloat(unit_price);

    const supplier = await dbSuppliers.getSupplier(supId);
    if (!supplier) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar un proveedor válido.' });
    }
    const rawMat = (store.raw_materials || []).find(m => m.id === matId);
    if (!rawMat) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar un insumo válido.' });
    }
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ success: false, error: 'El precio unitario debe ser un número válido.' });
    }

    const strAvailability = ['disponible', 'agotado', 'a_pedido'].includes(availability) ? availability : 'disponible';
    const payload = { supplier_id: supId, raw_material_id: matId, product_name, unit_price: price, code, availability: strAvailability, lead_time };

    const idNum = parseInt(id || 0);
    if (idNum) {
      const updated = await dbSuppliers.updateSupplierProduct(idNum, payload);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Producto de proveedor no encontrado.' });
      }
    } else {
      await dbSuppliers.createSupplierProduct(payload);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Eliminar Producto de Proveedor - Requiere PIN Nivel 2
app.delete('/api/admin/supplier-products/:id', async (req, res) => {
  try {
    const { pin } = req.body;
    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }
    const ok = await dbSuppliers.deleteSupplierProduct(parseInt(req.params.id));
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Producto de proveedor no encontrado.' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Registrar Compra / Pedido a Proveedor (con uno o varios insumos a la vez)
// - Requiere PIN Nivel 2. Si se registra como "recibido", suma el stock y
// deja constancia en el historial de ingresos, igual que una carga manual.
app.post('/api/admin/supplier-purchases', async (req, res) => {
  try {
    const { supplier_id, items, status, notes, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const store = db.getStore();
    const supId = parseInt(supplier_id);
    const supplier = await dbSuppliers.getSupplier(supId);
    if (!supplier) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar un proveedor válido.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Debe cargar al menos un insumo en la compra.' });
    }

    const strStatus = status === 'recibido' ? 'recibido' : 'pendiente';

    const cleanItems = [];
    let total = 0;
    for (const it of items) {
      const matId = parseInt(it.raw_material_id);
      const qty = parseFloat(it.quantity);
      const price = parseFloat(it.unit_price);
      const rawMat = (store.raw_materials || []).find(m => m.id === matId);
      if (!rawMat || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) continue;
      const subtotal = qty * price;
      total += subtotal;
      cleanItems.push({
        raw_material_id: matId,
        raw_material_name: rawMat.name,
        unit: rawMat.unit,
        quantity: qty,
        unit_price: price,
        subtotal
      });
    }

    if (cleanItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Ningún insumo cargado es válido (revisá cantidades y precios).' });
    }

    const registeredBy = `${auth.user.name} (Nivel ${auth.user.level})`;
    const purchase = await dbSuppliers.createSupplierPurchase({
      supplier_id: supId,
      supplier_name: supplier.name,
      status: strStatus,
      items: cleanItems,
      total,
      notes: (notes || '').trim(),
      registered_by: registeredBy
    });

    if (strStatus === 'recibido') {
      if (!store.stock_entries) store.stock_entries = [];
      cleanItems.forEach(it => {
        const rawMat = store.raw_materials.find(m => m.id === it.raw_material_id);
        if (rawMat) rawMat.current_stock = (rawMat.current_stock || 0) + it.quantity;

        const entryId = store.stock_entries.length > 0 ? Math.max(...store.stock_entries.map(e => e.id)) + 1 : 1;
        store.stock_entries.unshift({
          id: entryId,
          date: purchase.date,
          supplier_name: supplier.name,
          raw_material_name: it.raw_material_name,
          unit: it.unit,
          quantity: it.quantity,
          unit_cost: it.unit_price,
          total_cost: it.subtotal,
          notes: `Compra a proveedor #${purchase.id}${notes ? ' - ' + notes : ''}`,
          registered_by: registeredBy
        });
      });
      db.saveStore();
      io.emit('stock_updated');
    }

    res.json({ success: true, purchase });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Marcar una Compra/Pedido pendiente como Recibido (aplica el ingreso de
// stock en ese momento) - Requiere PIN Nivel 2
app.put('/api/admin/supplier-purchases/:id/receive', async (req, res) => {
  try {
    const { pin } = req.body;
    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const result = await dbSuppliers.markPurchaseReceived(parseInt(req.params.id));
    if (result.error === 'not_found') {
      return res.status(404).json({ success: false, error: 'Compra no encontrada.' });
    }
    if (result.error === 'already_received') {
      return res.status(400).json({ success: false, error: 'Esta compra ya está marcada como recibida.' });
    }
    const purchase = result.purchase;

    const store = db.getStore();
    if (!store.stock_entries) store.stock_entries = [];
    purchase.items.forEach(it => {
      const rawMat = store.raw_materials.find(m => m.id === it.raw_material_id);
      if (rawMat) rawMat.current_stock = (rawMat.current_stock || 0) + it.quantity;

      const entryId = store.stock_entries.length > 0 ? Math.max(...store.stock_entries.map(e => e.id)) + 1 : 1;
      store.stock_entries.unshift({
        id: entryId,
        date: new Date().toISOString(),
        supplier_name: purchase.supplier_name,
        raw_material_name: it.raw_material_name,
        unit: it.unit,
        quantity: it.quantity,
        unit_cost: it.unit_price,
        total_cost: it.subtotal,
        notes: `Recepción de compra a proveedor #${purchase.id}`,
        registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
      });
    });

    db.saveStore();
    io.emit('stock_updated');
    res.json({ success: true, purchase });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obtener recetas / escandallos
app.get('/api/admin/recipes', (req, res) => {
  try {
    const store = db.getStore();
    res.json({ success: true, recipes: store.product_recipes || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Guardar receta de un producto generado por producción (Ficha Técnica)
app.post('/api/admin/recipes/save', (req, res) => {
  try {
    const { product_id, ingredients, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    const pid = parseInt(product_id);
    if (!pid) {
      return res.status(400).json({ success: false, error: 'Debe seleccionar un producto de cocina' });
    }

    const store = db.getStore();
    if (!store.product_recipes) store.product_recipes = [];

    store.product_recipes = store.product_recipes.filter(r => r.product_id !== pid);

    // Cada ingrediente puede ser un Insumo Genérico directo (raw_material_id)
    // O un Pre-Armado / Semielaborado (semi_elaborado_id) - nunca los dos a
    // la vez. El Pre-Armado vive en su base separada (db_semielaborados.js);
    // acá solo se guarda la referencia a su ID.
    if (Array.isArray(ingredients)) {
      ingredients.forEach(ing => {
        const qtyPerPortion = parseFloat(ing.qty_per_portion || 0);
        if (!(qtyPerPortion > 0)) return;

        if (ing.semi_elaborado_id) {
          const semiId = parseInt(ing.semi_elaborado_id);
          if (semiId) {
            store.product_recipes.push({
              product_id: pid,
              raw_material_id: null,
              semi_elaborado_id: semiId,
              qty_per_portion: qtyPerPortion
            });
          }
        } else if (ing.raw_material_id) {
          const rawMatId = parseInt(ing.raw_material_id);
          if (rawMatId) {
            store.product_recipes.push({
              product_id: pid,
              raw_material_id: rawMatId,
              semi_elaborado_id: null,
              qty_per_portion: qtyPerPortion
            });
          }
        }
      });
    }

    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, product_id: pid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// REGISTRO DE PRODUCCIÓN DIARIA DE COMIDA PREPARADA POR LA COCINA (REQUERIDO NIVEL 2 O 3)
app.post('/api/production/add', async (req, res) => {
  try {
    const { product_id, quantity, notes, operator_name, pin } = req.body;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN personal de operario o personal registrado (Nivel 1, 2 o 3) requerido' });
    }

    const store = db.getStore();
    const prod = store.products.find(p => p.id === parseInt(product_id));
    if (!prod) {
      return res.status(404).json({ success: false, error: 'Producto de comida elaborada no encontrado' });
    }

    const qtyAdd = parseFloat(quantity || 0);
    if (qtyAdd <= 0) {
      return res.status(400).json({ success: false, error: 'La cantidad producida debe ser mayor a 0' });
    }

    prod.stock_prepared = parseFloat(((prod.stock_prepared || 0) + qtyAdd).toFixed(3));
    prod.is_prepared_food = 1;

    // Descontar insumos y/o Pre-Armados según la Receta / Ficha Técnica (Escandallo)
    const { deducted: deductedMaterials } = await deductProductRecipeComponents(store, prod.id, qtyAdd);

    if (!store.production_entries) store.production_entries = [];

    const nextId = store.production_entries.length > 0 ? Math.max(...store.production_entries.map(e => e.id)) + 1 : 1;
    const newEntry = {
      id: nextId,
      date: new Date().toISOString(),
      product_id: prod.id,
      product_name: prod.name,
      unit_type: prod.unit_type || 'kg',
      quantity: qtyAdd,
      notes: notes || '',
      operator_name: operator_name ? String(operator_name).trim() : auth.user.name,
      deducted_materials: deductedMaterials,
      registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
    };

    store.production_entries.unshift(newEntry);
    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, product: prod, entry: newEntry, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// MÓDULO DE PRODUCCIÓN PREVIA DE LOTES (COCINA, PANADERÍA Y COMIDA POR KILO)
// ==========================================

// GET /api/production/batches
app.get('/api/production/batches', (req, res) => {
  try {
    const store = db.getStore();
    if (!store.production_batches) store.production_batches = [];
    res.json({
      success: true,
      batches: store.production_batches,
      products: store.products || [],
      raw_materials: store.raw_materials || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/production/batches/start (Iniciar Lote de Producción)
app.post('/api/production/batches/start', (req, res) => {
  try {
    const { product_id, quantity, category_sector, operator_name, notes, pin } = req.body;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de operario registrado (Nivel 1, 2 o 3) requerido' });
    }

    const store = db.getStore();
    const prod = store.products.find(p => p.id === parseInt(product_id));
    if (!prod) {
      return res.status(404).json({ success: false, error: 'Producto de comida elaborada o panificados no encontrado' });
    }

    const qtyAdd = parseFloat(quantity || 0);
    if (qtyAdd <= 0) {
      return res.status(400).json({ success: false, error: 'La cantidad a producir debe ser mayor a 0' });
    }

    if (!store.production_batches) store.production_batches = [];

    const nextId = store.production_batches.length > 0 ? Math.max(...store.production_batches.map(b => b.id)) + 1 : 1;
    const batchNumber = `#PROD-${100 + nextId}`;

    const newBatch = {
      id: nextId,
      batch_number: batchNumber,
      product_id: prod.id,
      product_name: prod.name,
      category_sector: category_sector || 'Cocina - Elaboración General',
      quantity: qtyAdd,
      unit_type: prod.unit_type || 'kg',
      operator_name: operator_name ? String(operator_name).trim() : auth.user.name,
      operator_pin: auth.user.pin,
      started_at: new Date().toISOString(),
      finished_at: null,
      duration_seconds: null,
      status: 'in_progress',
      notes: notes || '',
      deducted_materials: []
    };

    store.production_batches.unshift(newBatch);
    db.saveStore();

    io.emit('production_updated', newBatch);

    res.json({ success: true, batch: newBatch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/production/batches/:id/finish (Concluir Lote de Producción)
app.post('/api/production/batches/:id/finish', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const store = db.getStore();
    if (!store.production_batches) store.production_batches = [];
    const batch = store.production_batches.find(b => b.id === parseInt(id));

    if (!batch) {
      return res.status(404).json({ success: false, error: 'Lote de producción no encontrado' });
    }

    if (batch.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Este lote de producción ya fue marcado como finalizado' });
    }

    const now = new Date();
    const startTime = new Date(batch.started_at);
    const durationSeconds = Math.max(1, Math.floor((now - startTime) / 1000));

    batch.finished_at = now.toISOString();
    batch.duration_seconds = durationSeconds;
    batch.status = 'completed';
    if (notes) batch.notes = (batch.notes ? `${batch.notes} | ` : '') + notes;

    // Actualizar Stock de Comida Preparada y Análisis Estadístico de Costos
    const prod = store.products.find(p => p.id === batch.product_id);
    let rawMaterialCostTotal = 0;

    if (prod) {
      prod.stock_prepared = parseFloat(((prod.stock_prepared || 0) + batch.quantity).toFixed(3));
      prod.is_prepared_food = 1;

      // Descontar insumos y/o Pre-Armados según Ficha Técnica (Escandallo) y calcular costo directo
      const { deducted: deductedMaterials, totalCost } = await deductProductRecipeComponents(store, prod.id, batch.quantity);
      rawMaterialCostTotal = totalCost;
      batch.deducted_materials = deductedMaterials;

      // Cálculo de Mano de Obra por Tiempo (Tarifa Horaria del Operario)
      const hourlyRate = parseFloat((store.settings && store.settings.production_hourly_wage) || 3500);
      const laborCostTotal = parseFloat(((durationSeconds / 3600) * hourlyRate).toFixed(2));
      const totalBatchCost = parseFloat((rawMaterialCostTotal + laborCostTotal).toFixed(2));
      const unitCostReal = parseFloat((totalBatchCost / batch.quantity).toFixed(2));
      const sellingPriceUnit = parseFloat(prod.price || 0);
      const profitMarginPercent = sellingPriceUnit > 0 
        ? parseFloat((((sellingPriceUnit - unitCostReal) / sellingPriceUnit) * 100).toFixed(1)) 
        : 0;

      // Guardar Análisis Financiero y Estadístico en el Lote
      batch.cost_analysis = {
        raw_material_cost_total: rawMaterialCostTotal,
        hourly_rate: hourlyRate,
        labor_cost_total: laborCostTotal,
        total_batch_cost: totalBatchCost,
        unit_cost_real: unitCostReal,
        selling_price_unit: sellingPriceUnit,
        profit_margin_percent: profitMarginPercent
      };

      // Actualizar automáticamente el costo unitario del producto en la base de datos
      prod.cost_price = unitCostReal;
    }

    // Guardar también en el registro histórico de production_entries para auditoría
    if (!store.production_entries) store.production_entries = [];
    store.production_entries.unshift({
      id: store.production_entries.length + 1,
      date: batch.finished_at,
      product_id: batch.product_id,
      product_name: batch.product_name,
      unit_type: batch.unit_type,
      quantity: batch.quantity,
      cost_analysis: batch.cost_analysis || null,
      notes: `Lote ${batch.batch_number} - Duración: ${Math.floor(durationSeconds/60)}m ${durationSeconds%60}s | Costo Unitario Real: $${batch.cost_analysis ? batch.cost_analysis.unit_cost_real : 0}`,
      operator_name: batch.operator_name,
      deducted_materials: deductedMaterials,
      registered_by: `${batch.operator_name} (Lote KDS)`
    });

    db.saveStore();

    io.emit('production_updated', batch);
    io.emit('stock_updated');

    res.json({ success: true, batch, product: prod });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ARQUEO DE SOBRANTES Y CONCILIACIÓN DE DESPERDICIOS/MERMAS/OFERTAS AL CIERRE DE CAJA
app.post('/api/cash/shift/reconcile-food', (req, res) => {
  try {
    const { box_number, measured_items, pin } = req.body;

    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN no registrado o inválido.' });
    }

    const store = db.getStore();
    if (!store.food_waste_logs) store.food_waste_logs = [];

    const numBox = parseInt(box_number || 1);
    const wasteResults = [];

    if (Array.isArray(measured_items)) {
      measured_items.forEach(item => {
        const prod = store.products.find(p => p.id === parseInt(item.product_id));
        if (prod) {
          const expectedStock = parseFloat((prod.stock_prepared || 0).toFixed(3));
          const measuredKg = parseFloat(parseFloat(item.measured_remaining || 0).toFixed(3));
          const wasteKg = parseFloat(Math.max(0, expectedStock - measuredKg).toFixed(3));
          const action = item.action || 'waste';

          // Resetear el producto fresco original a 0 para el siguiente turno
          prod.stock_prepared = 0;

          if (measuredKg > 0) {
            if (action === 'offer') {
              // 1. OFERTA REFRIGERADA CON CÓDIGO DE BARRAS EAN-13 PARA LA BALANZA
              const discountPercent = parseFloat(item.discount_percent || 30);
              const hours = parseInt(item.refrigerated_hours || 4);
              const offerPrice = parseFloat((prod.price * (1 - (discountPercent / 100))).toFixed(2));
              
              const offerPlu = `9${String(prod.plu_code || prod.id).padStart(3, '0')}`;
              const offerName = `❄️ ${prod.name} (Refrigerado ${hours}hs - ${discountPercent}% OFF)`;
              const scaleEanCode = `20${offerPlu}00000`; // Prefijo Balanza EAN-13

              // Buscar si ya existe la oferta o crear un producto nuevo en oferta
              let offerProd = store.products.find(p => p.is_refrigerated_offer === 1 && p.original_product_id === prod.id);
              if (offerProd) {
                offerProd.name = offerName;
                offerProd.price = offerPrice;
                offerProd.original_price = prod.price;
                offerProd.stock_prepared = parseFloat(((offerProd.stock_prepared || 0) + measuredKg).toFixed(3));
                offerProd.refrigerated_hours = hours;
                offerProd.discount_percent = discountPercent;
                offerProd.available = 1;
              } else {
                const nextId = store.products.length > 0 ? Math.max(...store.products.map(p => p.id)) + 1 : 1;
                offerProd = {
                  id: nextId,
                  original_product_id: prod.id,
                  category_id: prod.category_id,
                  name: offerName,
                  description: `Conservación en frío de ${hours} hs. Calidad óptima a precio rebajado (${discountPercent}% OFF).`,
                  price: offerPrice,
                  original_price: prod.price,
                  image_url: prod.image_url,
                  available: 1,
                  stock_prepared: measuredKg,
                  unit_type: 'kg',
                  is_prepared_food: 1,
                  is_refrigerated_offer: 1,
                  discount_percent: discountPercent,
                  refrigerated_hours: hours,
                  plu_code: offerPlu,
                  barcode: scaleEanCode
                };
                store.products.push(offerProd);
              }

              const nextLogId = store.food_waste_logs.length > 0 ? Math.max(...store.food_waste_logs.map(w => w.id)) + 1 : 1;
              const offerRecord = {
                id: nextLogId,
                date: new Date().toISOString(),
                box_number: numBox,
                product_id: prod.id,
                product_name: prod.name,
                action: 'offer',
                action_label: `🏷️ Oferta Refrigerada (${discountPercent}% OFF)`,
                unit_type: 'kg',
                expected_kg: expectedStock,
                measured_kg: measuredKg,
                waste_kg: 0,
                scale_ean: scaleEanCode,
                offer_price: offerPrice,
                notes: `Convertido a Oferta Refrigerada (${hours} hs de conservación, ${discountPercent}% descuento)`,
                registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
              };
              store.food_waste_logs.unshift(offerRecord);
              wasteResults.push(offerRecord);

            } else if (action === 'reprocess') {
              // 2. REPROCESADO EN COCINA (DESCUENTO 100% A INSUMO / MATERIA PRIMA)
              const rawMatId = parseInt(item.target_raw_material_id || 0);
              const rawMat = (store.raw_materials || []).find(m => m.id === rawMatId);

              if (rawMat) {
                rawMat.current_stock = parseFloat(((rawMat.current_stock || 0) + measuredKg).toFixed(3));
              }

              const nextLogId = store.food_waste_logs.length > 0 ? Math.max(...store.food_waste_logs.map(w => w.id)) + 1 : 1;
              const reprocessRecord = {
                id: nextLogId,
                date: new Date().toISOString(),
                box_number: numBox,
                product_id: prod.id,
                product_name: prod.name,
                action: 'reprocess',
                action_label: `♻️ Reprocesado en Cocina (Insumo: ${rawMat ? rawMat.name : 'Cocina'})`,
                unit_type: 'kg',
                expected_kg: expectedStock,
                measured_kg: measuredKg,
                waste_kg: 0,
                notes: `Reprocesado 100% como ingrediente para ${rawMat ? rawMat.name : 'Cocina'}`,
                registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
              };
              store.food_waste_logs.unshift(reprocessRecord);
              wasteResults.push(reprocessRecord);

            } else {
              // 3. DESPERDICIO / TIRADO / INAPTO
              const nextLogId = store.food_waste_logs.length > 0 ? Math.max(...store.food_waste_logs.map(w => w.id)) + 1 : 1;
              const wasteRecord = {
                id: nextLogId,
                date: new Date().toISOString(),
                box_number: numBox,
                product_id: prod.id,
                product_name: prod.name,
                action: 'waste',
                action_label: '🗑️ Desperdicio / Tirado',
                unit_type: 'kg',
                expected_kg: expectedStock,
                measured_kg: 0,
                waste_kg: measuredKg,
                notes: item.notes || 'Comida sobrante no apta dada de baja al cierre de turno',
                registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
              };
              store.food_waste_logs.unshift(wasteRecord);
              wasteResults.push(wasteRecord);
            }
          }
        }
      });
    }

    db.saveStore();
    io.emit('stock_updated');

    res.json({ success: true, waste_logs: wasteResults, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS API DE MENÚ Y CLIENTE
app.get('/api/menu', (req, res) => {
  try {
    const store = db.getStore();
    const categories = [...store.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const products = store.products;
    const settings = getSettingsMap();

    res.json({
      success: true,
      categories,
      products,
      settings
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DESCARGAR EXCEL DEL MENÚ ACTUALIZADO (desde el admin, sin PIN requerido)
app.get('/api/admin/export-excel', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const store = db.getStore();
    const productos  = store.products   || [];
    const categorias = store.categories || [];
    const settings   = getSettingsMap();
    const NOMBRE_LOCAL = settings.restaurant_name || 'La Gran Rotisería';
    const FECHA = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Mapa categoría ID → nombre con ícono
    const catMap = {};
    categorias.forEach(c => { catMap[c.id] = `${c.icon || ''} ${c.name}`.trim(); });

    // Ordenar por sort_order de categoría
    const sorted = [...productos].sort((a, b) => {
      const catA = categorias.find(c => c.id === a.category_id);
      const catB = categorias.find(c => c.id === b.category_id);
      return ((catA?.sort_order || 0) - (catB?.sort_order || 0)) || (a.id - b.id);
    });

    const disponibles    = sorted.filter(p => p.available !== 0);
    const noDisponibles  = sorted.filter(p => p.available === 0);

    const buildRow = p => ({
      'ID Interno':        p.id,
      'Código':            p.code        || '',
      'Categoría':         catMap[p.category_id] || `ID ${p.category_id}`,
      'Nombre del Plato':  p.name,
      'Descripción':       p.description || '',
      '★ PRECIO ($ARS)':   p.price,
      '% Descuento':       p.descuento_pct || 0,
      'Precio Promo ($ARS)': p.precio_promo || p.price,
      'Disponible':        p.available !== 0 ? 'Sí' : 'No',
      'Tipo de Unidad':    p.unit_type   || 'unidad',
      'Foto (URL)':        p.image_url   || '',
      'Video (URL)':       p.video_url   || '',
    });

    const colWidths = [{ wch:14 },{ wch:30 },{ wch:52 },{ wch:68 },{ wch:14 },{ wch:12 },{ wch:14 },{ wch:72 },{ wch:72 },{ wch:10 }];

    const wb = XLSX.utils.book_new();

    // Hoja 1: Menú Completo
    const ws1 = XLSX.utils.json_to_sheet([...disponibles, ...noDisponibles].map(buildRow));
    ws1['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws1, 'Menú Completo');

    // Hoja 2: Solo Disponibles
    const ws2 = XLSX.utils.json_to_sheet(disponibles.map(buildRow));
    ws2['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws2, 'Solo Disponibles');

    // Hoja 3: Resumen por categoría
    const resumenMap = {};
    disponibles.forEach(p => {
      const cat = catMap[p.category_id] || 'Sin Categoría';
      if (!resumenMap[cat]) resumenMap[cat] = { cantidad: 0, precio_min: Infinity, precio_max: 0 };
      resumenMap[cat].cantidad++;
      if (p.price < resumenMap[cat].precio_min) resumenMap[cat].precio_min = p.price;
      if (p.price > resumenMap[cat].precio_max) resumenMap[cat].precio_max = p.price;
    });
    const filasResumen = Object.entries(resumenMap).map(([cat, d]) => ({
      'Categoría': cat, 'Cantidad Platos': d.cantidad,
      'Precio Mínimo': d.precio_min === Infinity ? '-' : d.precio_min,
      'Precio Máximo': d.precio_max,
    }));
    const ws3 = XLSX.utils.json_to_sheet(filasResumen);
    ws3['!cols'] = [{ wch:35 },{ wch:16 },{ wch:16 },{ wch:16 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Resumen por Categoría');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fileName = `menu_${NOMBRE_LOCAL.replace(/\s+/g,'_')}_${FECHA.replace(/\//g,'-')}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('Error generando Excel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// IMPORTACIÓN MASIVA DE PRECIOS DESDE EXCEL (REQUERIDO NIVEL 3)
app.post('/api/admin/import-excel', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { fileBase64, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La importación masiva requiere PIN Nivel 3.' });
    }
    if (!fileBase64) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo Excel.' });
    }

    // Decodificar base64 → buffer → workbook
    const buf = Buffer.from(fileBase64, 'base64');
    const wb  = XLSX.read(buf, { type: 'buffer' });

    // Leer la primera hoja
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);

    if (!rows || rows.length === 0) {
      return res.status(400).json({ success: false, error: 'El archivo Excel está vacío o no tiene datos en la primera hoja.' });
    }

    const store = db.getStore();
    let actualizados = 0;
    let errores = [];

    rows.forEach((row, idx) => {
      // Columnas aceptadas (con variantes de nombre)
      const id        = parseInt(row['ID Interno'] || row['ID'] || row['id'] || 0);
      const newPrice  = parseFloat(row['★ PRECIO ($ARS)'] || row['PRECIO'] || row['precio'] || row['price'] || 0);
      const newDescPct = Math.min(99, Math.max(0, parseInt(row['% Descuento'] || row['descuento_pct'] || 0)));

      if (!id || isNaN(id)) return; // saltar filas sin ID
      if (isNaN(newPrice) || newPrice <= 0) {
        errores.push(`Fila ${idx + 2}: ID ${id} → precio inválido (${row['★ PRECIO ($ARS)']})`);
        return;
      }

      const prod = store.products.find(p => p.id === id);
      if (!prod) {
        errores.push(`Fila ${idx + 2}: ID ${id} no encontrado en el sistema`);
        return;
      }

      prod.price       = newPrice;
      prod.descuento_pct = newDescPct;
      prod.precio_promo  = newDescPct > 0 ? Math.round(newPrice * (1 - newDescPct / 100)) : newPrice;
      actualizados++;
    });

    db.saveStore();
    io.emit('menu_updated');

    res.json({
      success: true,
      actualizados,
      errores,
      user_name: auth.user.name,
      message: `✅ ${actualizados} producto(s) actualizados por ${auth.user.name}.${errores.length > 0 ? ` ⚠️ ${errores.length} fila(s) con errores.` : ''}`
    });

  } catch (err) {
    console.error('Error importando Excel:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// REGISTRO DE NUEVO SOCIO DEL CLUB / EDICIÓN DE PERFIL
app.post('/api/club/register', (req, res) => {
  try {
    const { dni, name, phone, address, birthdate, referral_code } = req.body;
    const strDni = (dni || '').trim();
    const strName = (name || '').trim();
    const strPhone = (phone || '').trim();

    if (!strDni || !strName || !strPhone) {
      return res.status(400).json({ success: false, error: '⚠️ DNI, Nombre y Teléfono WhatsApp son obligatorios.' });
    }

    const store = db.getStore();
    if (!store.customers) store.customers = [];

    let customer = store.customers.find(c => String(c.dni).trim() === strDni);
    let isNew = false;
    const welcomePts = parseInt((store.settings && store.settings.welcome_points) || 1000);
    const referralPts = parseInt((store.settings && store.settings.referral_points) || 500);

    if (customer) {
      customer.name = strName;
      customer.phone = strPhone;
      if (address) customer.address = address.trim();
      if (birthdate) customer.birthdate = birthdate.trim();
      customer.updated_at = new Date().toISOString();
    } else {
      isNew = true;
      const nextId = store.customers.length > 0 ? Math.max(...store.customers.map(c => c.id)) + 1 : 1;
      customer = {
        id: nextId,
        dni: strDni,
        name: strName,
        phone: strPhone,
        address: (address || '').trim(),
        birthdate: (birthdate || '').trim(),
        points: welcomePts,
        total_orders: 0,
        total_spent: 0,
        referral_code: `REF-${strDni}`,
        referred_by: (referral_code || '').trim(),
        history: [
          {
            date: new Date().toISOString(),
            description: '🎁 Regalo de Bienvenida al Club La Gran Rotisería',
            points_change: welcomePts,
            type: 'welcome'
          }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Si fue referido por otro socio, acreditarle puntos al referente
      if (referral_code) {
        const cleanRef = String(referral_code).trim().replace('REF-', '');
        const referrer = store.customers.find(c => String(c.dni).trim() === cleanRef || String(c.phone).trim() === cleanRef);
        if (referrer) {
          referrer.points = (referrer.points || 0) + referralPts;
          if (!referrer.history) referrer.history = [];
          referrer.history.unshift({
            date: new Date().toISOString(),
            description: `👥 Premio por Invitar al Nuevo Socio ${strName} (DNI ${strDni})`,
            points_change: referralPts,
            type: 'referral'
          });
        }
      }

      store.customers.unshift(customer);
    }

    db.saveStore();
    io.emit('customer_updated', customer);

    res.json({
      success: true,
      is_new: isNew,
      welcome_points: isNew ? welcomePts : 0,
      customer
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RECUPERAR CUENTA Y SALDO DE SOCIO POR DNI
app.post('/api/club/login-by-dni', (req, res) => {
  try {
    const { dni } = req.body;
    const strDni = (dni || '').trim();
    if (!strDni) {
      return res.status(400).json({ success: false, error: 'Ingrese el número de DNI.' });
    }

    const store = db.getStore();
    const customer = (store.customers || []).find(c => String(c.dni).trim() === strDni);

    if (!customer) {
      return res.status(404).json({ success: false, error: `Socio no encontrado con DNI ${strDni}. Debe asociarse completando su perfil.` });
    }

    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, customer_phone, customer_dni, address, delivery_type, payment_method, payment_note, notes, items, total } = req.body;

    if (!customer_name || !customer_phone || !items || !total) {
      return res.status(400).json({ success: false, error: 'Faltan datos obligatorios del pedido' });
    }

    const store = db.getStore();
    const totalOrders = store.orders.length;
    const orderNumber = `#${101 + totalOrders}`;

    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);

    if (payment_method && payment_method.includes('Cuenta Corriente')) {
      const account = store.customer_accounts.find(a => 
        a.dni === payment_note || 
        a.phone.includes(customer_phone) || 
        customer_phone.includes(a.phone)
      );

      if (!account) {
        return res.status(400).json({ 
          success: false, 
          error: `El cliente ${customer_name} no posee una Cuenta Corriente autorizada en el sistema. Debe registrarse previamente en el Panel de Administración.` 
        });
      }
    }

    const nextId = store.orders.length > 0 ? Math.max(...store.orders.map(o => o.id)) + 1 : 1;
    const newOrder = {
      id: nextId,
      order_number: orderNumber,
      customer_name,
      customer_phone,
      customer_dni: customer_dni || '',
      address: address || 'Retiro en local',
      delivery_type: delivery_type || 'delivery',
      payment_method: payment_method || 'Efectivo',
      payment_note: payment_note || '',
      notes: notes || '',
      items: typeof items === 'string' ? items : JSON.parse(itemsJson),
      total: parseFloat(total),
      status: 'nuevo',
      paid: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    store.orders.unshift(newOrder);

    // Acreditar puntos automáticamente al Socio si está registrado en el Club
    const strSearchDni = (customer_dni || '').trim();
    let customerObj = null;
    if (strSearchDni) {
      customerObj = (store.customers || []).find(c => String(c.dni).trim() === strSearchDni);
    }
    if (!customerObj && customer_phone) {
      customerObj = (store.customers || []).find(c => String(c.phone).trim() === String(customer_phone).trim());
    }

    if (customerObj) {
      const ptsRatio = parseFloat((store.settings && store.settings.points_per_100_currency) || 3);
      const pointsEarned = Math.floor((parseFloat(total) / 100) * ptsRatio);
      
      if (pointsEarned > 0) {
        customerObj.points = (customerObj.points || 0) + pointsEarned;
        customerObj.total_orders = (customerObj.total_orders || 0) + 1;
        customerObj.total_spent = (customerObj.total_spent || 0) + parseFloat(total);
        
        if (!customerObj.history) customerObj.history = [];
        customerObj.history.unshift({
          date: new Date().toISOString(),
          description: `🛒 Puntos acumulados por Pedido ${orderNumber} ($${total})`,
          points_change: pointsEarned,
          type: 'purchase'
        });

        newOrder.points_earned = pointsEarned;
      }
    }

    // Guardado CON confirmación: si la base no confirma que el pedido quedó
    // grabado, el catch de abajo le avisa a quien está pidiendo/cobrando en
    // vez de responder "éxito" y perder el pedido en silencio.
    await db.saveStoreAndConfirm();

    io.emit('new_order', newOrder);
    if (customerObj) io.emit('customer_updated', customerObj);

    const settings = getSettingsMap();
    if (settings.auto_print_epson === '1' && settings.epson_printer_ip) {
      printToEpsonNetwork(newOrder, settings.epson_printer_ip, settings.epson_printer_port || 9100)
        .then(() => console.log(`🖨️ Ticket ${orderNumber} impreso automáticamente en Epson ${settings.epson_printer_ip}`))
        .catch(err => console.error(`⚠️ Error al auto-imprimir en Epson: ${err.message}`));
    }

    res.json({
      success: true,
      order: newOrder,
      customer: customerObj || null
    });
  } catch (err) {
    console.error('Error al guardar pedido:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS API DE PANTALLA DE COCINA (KDS), CAJA & ADMIN
app.get('/api/orders', (req, res) => {
  try {
    const store = db.getStore();
    const { status } = req.query;
    let orders = store.orders;
    if (status) {
      orders = orders.filter(o => o.status === status);
    }
    orders = orders.map(o => ({
      ...o,
      items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items
    }));

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, delivered_at } = req.body;

    const validStatuses = ['nuevo', 'en_preparacion', 'en_camino', 'entregado', 'cancelado', 'ready', 'bar_despachado', 'en_proceso', 'falta_insumo'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado no válido' });
    }

    const store = db.getStore();
    const existingOrder = store.orders.find(o => o.id === parseInt(id));

    if (!existingOrder) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    // Un pedido ya anulado no puede volver a cambiar de estado (ni siquiera
    // a "entregado"): la venta quedó sin efecto, así que el botón de Caja
    // queda deshabilitado en la interfaz y acá se rechaza igual del lado
    // del servidor por si alguien intenta el cambio directo contra la API.
    if (existingOrder.status === 'cancelado') {
      return res.status(400).json({
        success: false,
        error: `El pedido ${existingOrder.order_number} está ANULADO, no se puede cambiar su estado.`
      });
    }

    const isCuentaCorriente = existingOrder.payment_method && existingOrder.payment_method.includes('Cuenta Corriente');

    if (isCuentaCorriente && ['en_preparacion', 'en_camino', 'entregado'].includes(status)) {
      const account = store.customer_accounts.find(a => 
        a.dni === existingOrder.payment_note || 
        a.phone.includes(existingOrder.customer_phone) || 
        existingOrder.customer_phone.includes(a.phone)
      );

      if (!account) {
        return res.status(400).json({ 
          success: false, 
          error: `⚠️ BLOQUEADO EN COCINA: El cliente ${existingOrder.customer_name} no posee una Cuenta Corriente autorizada en el sistema.` 
        });
      }

      const totalDeudaPróxima = (account.balance || 0) + existingOrder.total;
      if (totalDeudaPróxima > account.credit_limit) {
        return res.status(400).json({
          success: false,
          error: `⚠️ BLOQUEADO EN COCINA (LÍMITE EXCEDIDO): Deuda actual ($${account.balance}) + Pedido ($${existingOrder.total}) = $${totalDeudaPróxima}, superando el Límite Fiable de $${account.credit_limit}.\n\nSe requiere un Cobro Parcial en el Admin para desbloquear la cocina.`
        });
      }
    }

    if (status === 'entregado' && !isCuentaCorriente && existingOrder.paid !== 1) {
      return res.status(400).json({
        success: false,
        error: `No se puede marcar como Entregado el pedido ${existingOrder.order_number} porque aún no ha sido ingresado a Caja ($${existingOrder.total}). Primero debe ingresarse a caja.`
      });
    }

    if (status === 'en_preparacion' && existingOrder.status !== 'en_preparacion') {
      const orderItems = typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items;
      if (Array.isArray(orderItems)) {
        for (const item of orderItems) {
          await deductProductRecipeComponents(store, item.id, item.qty || 1);
        }
      }
    }

    if (status === 'entregado' && isCuentaCorriente && existingOrder.status !== 'entregado') {
      const account = store.customer_accounts.find(a => 
        a.dni === existingOrder.payment_note || 
        a.phone.includes(existingOrder.customer_phone) || 
        existingOrder.customer_phone.includes(a.phone)
      );
      if (account) {
        account.balance = (account.balance || 0) + existingOrder.total;
      }
    }

    existingOrder.status = status;
    if (delivered_at) existingOrder.delivered_at = delivered_at;
    existingOrder.updated_at = new Date().toISOString();
    db.saveStore();

    const updatedOrder = {
      ...existingOrder,
      items: typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items
    };

    io.emit('order_updated', updatedOrder);

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CANCELAR / ANULAR PEDIDO (REQUERIDO NIVEL 3). Sin `force_from_caja`, se
// comporta como antes: solo antes de ingresar a Caja (revierte stock). Con
// `force_from_caja: true` (usado desde el botón de Caja/Admin) también
// permite anular un pedido YA cobrado o entregado — revierte el saldo de
// Cuenta Corriente si corresponde, y deja marcado que el dinero ya cobrado
// en efectivo/tarjeta/MP debe reconciliarse a mano en la caja física.
app.post('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, pin, force_from_caja } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Anular un pedido requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const existingOrder = store.orders.find(o => o.id === parseInt(id));

    if (!existingOrder) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    if (existingOrder.status === 'cancelado') {
      return res.status(400).json({ success: false, error: `El pedido ${existingOrder.order_number} ya estaba cancelado.` });
    }

    const yaFacturadoOEntregado = existingOrder.paid === 1 || existingOrder.status === 'entregado';
    if (yaFacturadoOEntregado && !force_from_caja) {
      return res.status(400).json({
        success: false,
        error: `El pedido ${existingOrder.order_number} ya fue ingresado a Caja ($${existingOrder.total}) o marcado Entregado. No puede anularse desde Cocina: hacelo desde el botón "Anular venta" en Caja / Admin.`
      });
    }

    // Si la comanda ya había entrado a cocina (descontando insumos), se revierte el stock consumido
    const statusesConDescuentoDeStock = ['en_preparacion', 'en_camino', 'ready', 'bar_despachado', 'en_proceso', 'entregado'];
    if (statusesConDescuentoDeStock.includes(existingOrder.status)) {
      const orderItems = typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items;
      if (Array.isArray(orderItems)) {
        for (const item of orderItems) {
          await restoreProductRecipeComponents(store, item.id, item.qty || 1);
        }
      }
    }

    // Si el pedido era de Cuenta Corriente y ya se le había cargado la deuda
    // al cliente (al marcarlo Entregado), se la revertimos acá.
    const isCuentaCorriente = existingOrder.payment_method && existingOrder.payment_method.includes('Cuenta Corriente');
    let reversedAccount = null;
    if (isCuentaCorriente && existingOrder.status === 'entregado') {
      const account = store.customer_accounts.find(a =>
        a.dni === existingOrder.payment_note ||
        (a.phone && existingOrder.customer_phone && (a.phone.includes(existingOrder.customer_phone) || existingOrder.customer_phone.includes(a.phone)))
      );
      if (account) {
        account.balance = Math.max(0, (account.balance || 0) - existingOrder.total);
        reversedAccount = account;
      }
    }

    // BUG REAL REPORTADO: un pedido anulado seguía "quedándose" con los
    // puntos de Club que se le habían sumado al Socio al CREARSE el pedido
    // (ver POST /api/orders). Acá se revierten esos puntos y se descuenta el
    // pedido de sus estadísticas, para que anular una venta también anule
    // los puntos que esa venta le había generado al cliente.
    if (existingOrder.points_earned > 0) {
      const strDniLookup = (existingOrder.customer_dni || '').trim();
      let customerObj = null;
      if (strDniLookup) {
        customerObj = (store.customers || []).find(c => String(c.dni).trim() === strDniLookup);
      }
      if (!customerObj && existingOrder.customer_phone) {
        customerObj = (store.customers || []).find(c => String(c.phone).trim() === String(existingOrder.customer_phone).trim());
      }
      if (customerObj) {
        customerObj.points = Math.max(0, (customerObj.points || 0) - existingOrder.points_earned);
        customerObj.total_orders = Math.max(0, (customerObj.total_orders || 0) - 1);
        customerObj.total_spent = Math.max(0, (customerObj.total_spent || 0) - existingOrder.total);
        if (!customerObj.history) customerObj.history = [];
        customerObj.history.unshift({
          date: new Date().toISOString(),
          description: `🚫 Puntos revertidos por Anulación del Pedido ${existingOrder.order_number}`,
          points_change: -existingOrder.points_earned,
          type: 'cancellation'
        });
      }
      existingOrder.points_reversed = existingOrder.points_earned;
      existingOrder.points_earned = 0;
    }

    const previousStatus = existingOrder.status;
    const previousPaid = existingOrder.paid;
    existingOrder.status = 'cancelado';
    existingOrder.paid = 0;
    existingOrder.cancelled_reason = (reason || '').trim() || 'Sin motivo especificado';
    existingOrder.cancelled_by = `${auth.user.name} (Nivel ${auth.user.level})`;
    existingOrder.cancelled_at = new Date().toISOString();
    existingOrder.cancelled_from_caja = !!force_from_caja;
    existingOrder.status_before_cancel = previousStatus;
    existingOrder.was_paid_before_cancel = previousPaid === 1;
    existingOrder.updated_at = new Date().toISOString();

    // Guardado CON confirmación: una anulación (sobre todo de un pedido ya
    // cobrado) no puede quedar solo en memoria.
    await db.saveStoreAndConfirm();

    const updatedOrder = {
      ...existingOrder,
      items: typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items
    };

    io.emit('order_updated', updatedOrder);
    io.emit('stock_updated');
    if (reversedAccount) io.emit('customer_updated', reversedAccount);

    res.json({
      success: true,
      order: updatedOrder,
      user_name: auth.user.name,
      warning: (previousPaid === 1 && !isCuentaCorriente)
        ? `⚠️ Este pedido ya había sido cobrado en efectivo/tarjeta/MP ($${existingOrder.total}). El sistema lo anuló y lo sacó de las ventas válidas, pero el ajuste del dinero físico en la caja hay que hacerlo a mano.`
        : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CAMBIAR LA FORMA DE PAGO DE UN PEDIDO YA CARGADO (REQUERIDO NIVEL 3).
// Deja registro de quién lo cambió, cuándo y desde/hacia qué método — y
// ajusta el saldo de Cuenta Corriente si el cambio entra o sale de ese medio
// de pago en un pedido ya marcado Entregado.
app.post('/api/orders/:id/change-payment-method', async (req, res) => {
  try {
    const { id } = req.params;
    const { new_payment_method, new_payment_note, new_payments, reason, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Cambiar la forma de pago requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    const order = store.orders.find(o => o.id === parseInt(id));
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }
    if (order.status === 'cancelado') {
      return res.status(400).json({ success: false, error: `El pedido ${order.order_number} está anulado, no se le puede cambiar la forma de pago.` });
    }

    // Se puede pasar `new_payment_method` (un único medio, como antes) o
    // `new_payments` (array [{method, amount}, ...] para dividir el pago en
    // varios medios). Al menos uno de los dos es obligatorio.
    let newMethodSummary = new_payment_method;
    let newCombinedPayments = null;
    if (new_payments && Array.isArray(new_payments) && new_payments.length > 0) {
      const cleanPayments = new_payments
        .map(p => ({ method: String(p.method || '').trim(), amount: parseFloat(p.amount) || 0, note: (p.note || '').trim() }))
        .filter(p => p.method && p.amount > 0);
      if (cleanPayments.length === 0) {
        return res.status(400).json({ success: false, error: 'Los pagos combinados ingresados no son válidos.' });
      }
      const sumPayments = cleanPayments.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(sumPayments - order.total) > 1) {
        return res.status(400).json({
          success: false,
          error: `⚠️ Los pagos combinados suman $${sumPayments} y el total del pedido es $${order.total}. Tienen que coincidir.`
        });
      }
      newCombinedPayments = cleanPayments;
      newMethodSummary = cleanPayments.length > 1
        ? cleanPayments.map(p => `${p.method} ($${p.amount})`).join(' + ')
        : cleanPayments[0].method;
    }
    if (!newMethodSummary) {
      return res.status(400).json({ success: false, error: 'Falta indicar la nueva forma de pago.' });
    }

    const wasCuentaCorriente = order.payment_method && order.payment_method.includes('Cuenta Corriente');
    const willBeCuentaCorriente = newMethodSummary.includes('Cuenta Corriente');

    // Si el pedido ya está Entregado, la deuda de Cta Cte ya se contabilizó
    // al cliente — hay que sacarla o cargarla según corresponda al cambiar.
    if (order.status === 'entregado' && wasCuentaCorriente !== willBeCuentaCorriente) {
      const account = store.customer_accounts.find(a =>
        a.dni === (order.payment_note || new_payment_note) ||
        (a.phone && order.customer_phone && (a.phone.includes(order.customer_phone) || order.customer_phone.includes(a.phone)))
      );
      if (account) {
        if (wasCuentaCorriente && !willBeCuentaCorriente) {
          account.balance = Math.max(0, (account.balance || 0) - order.total);
        } else if (!wasCuentaCorriente && willBeCuentaCorriente) {
          account.balance = (account.balance || 0) + order.total;
        }
      } else if (willBeCuentaCorriente) {
        return res.status(400).json({ success: false, error: `No se encontró una Cuenta Corriente autorizada para este cliente, no se puede pasar el pedido a ese medio de pago.` });
      }
    }

    const previousMethod = order.payment_method;
    order.payment_method = newMethodSummary;
    order.payments = newCombinedPayments; // null si quedó en un único medio
    if (new_payment_note !== undefined) order.payment_note = new_payment_note;
    if (!order.payment_method_history) order.payment_method_history = [];
    order.payment_method_history.push({
      from: previousMethod,
      to: newMethodSummary,
      reason: (reason || '').trim() || 'Sin motivo especificado',
      changed_by: `${auth.user.name} (Nivel ${auth.user.level})`,
      changed_at: new Date().toISOString()
    });
    order.updated_at = new Date().toISOString();

    await db.saveStoreAndConfirm();

    io.emit('order_updated', { ...order, items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items });

    res.json({ success: true, order, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// BACKUP DIARIO DE MOVIMIENTOS DE CAJA (TURNOS, VENTAS, CTA CTE, ANULACIONES Y
// CAMBIOS DE FORMA DE PAGO). Se genera 1 vez por día (automático, ver tarea
// programada) y queda guardado ADENTRO de la base (store.daily_backups), no
// en el disco del servidor -> sobrevive a reinicios/redeploys de Render.
// ==========================================
function buildDailyBackupSnapshot(store, dateStr) {
  // Argentina no tiene horario de verano -> offset fijo -03:00 todo el año.
  const dayStart = new Date(`${dateStr}T00:00:00-03:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999-03:00`);
  const inRange = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= dayStart.getTime() && t <= dayEnd.getTime();
  };

  const cashShifts = (store.cash_shifts || []).filter(s => inRange(s.opened_at) || inRange(s.closed_at));
  const ordersCreated = (store.orders || []).filter(o => inRange(o.created_at));
  const cancellations = (store.orders || []).filter(o => o.status === 'cancelado' && inRange(o.cancelled_at));
  const accountPayments = (store.account_payments || []).filter(p => inRange(p.date));

  const paymentChanges = [];
  (store.orders || []).forEach(o => {
    (o.payment_method_history || []).forEach(h => {
      if (inRange(h.changed_at)) {
        paymentChanges.push({
          order_id: o.id,
          order_number: o.order_number,
          from: h.from,
          to: h.to,
          reason: h.reason,
          changed_by: h.changed_by,
          changed_at: h.changed_at
        });
      }
    });
  });

  const ventasValidas = ordersCreated.filter(o => o.status !== 'cancelado');
  const summary = {
    cantidad_ventas: ventasValidas.length,
    total_vendido: ventasValidas.reduce((s, o) => s + (o.total || 0), 0),
    total_efectivo: ventasValidas.filter(o => (o.payment_method || '').includes('Efectivo')).reduce((s, o) => s + (o.total || 0), 0),
    total_tarjeta: ventasValidas.filter(o => (o.payment_method || '').includes('Tarjeta') || (o.payment_method || '').toLowerCase().includes('posnet')).reduce((s, o) => s + (o.total || 0), 0),
    total_mp: ventasValidas.filter(o => (o.payment_method || '').toLowerCase().includes('mercadopago') || (o.payment_method || '').toLowerCase().includes('mercado pago')).reduce((s, o) => s + (o.total || 0), 0),
    total_cta_cte: ventasValidas.filter(o => (o.payment_method || '').includes('Cuenta Corriente')).reduce((s, o) => s + (o.total || 0), 0),
    cantidad_anuladas: cancellations.length,
    total_anulado: cancellations.reduce((s, o) => s + (o.total || 0), 0),
    turnos_caja: cashShifts.length,
    pagos_cta_cte: accountPayments.length,
    cambios_forma_pago: paymentChanges.length
  };

  return {
    id: dateStr,
    date: dateStr,
    created_at: new Date().toISOString(),
    cash_shifts: cashShifts,
    orders: ordersCreated,
    cancellations,
    account_payments: accountPayments,
    payment_changes: paymentChanges,
    summary
  };
}

// GENERA (O REGENERA) EL BACKUP DEL DÍA INDICADO Y LO GUARDA EN LA BASE.
// Lo dispara automáticamente una tarea programada 1 vez por día, y también se
// puede disparar a mano desde el panel (botón "Generar backup de hoy").
app.post('/api/admin/backups/generate', async (req, res) => {
  try {
    const { date, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Generar el backup diario requiere PIN de Encargado (Nivel 2) o Gerente (Nivel 3).' });
    }

    const store = db.getStore();
    if (!store.daily_backups) store.daily_backups = [];

    const dateStr = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }); // YYYY-MM-DD
    const snapshot = buildDailyBackupSnapshot(store, dateStr);

    const existingIdx = store.daily_backups.findIndex(b => b.id === dateStr);
    if (existingIdx >= 0) store.daily_backups[existingIdx] = snapshot;
    else store.daily_backups.unshift(snapshot);

    // No dejar crecer el blob de la base para siempre: conservamos los
    // últimos 120 días de backups diarios (~4 meses), más que suficiente
    // para cualquier auditoría razonable.
    store.daily_backups.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (store.daily_backups.length > 120) store.daily_backups = store.daily_backups.slice(0, 120);

    await db.saveStoreAndConfirm();

    res.json({ success: true, backup: snapshot, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// LISTA LIVIANA DE BACKUPS DIARIOS DISPONIBLES (sin el detalle completo, para
// no mandar un JSON gigante cada vez que se abre la pantalla de Backups).
app.get('/api/admin/backups', (req, res) => {
  try {
    const store = db.getStore();
    const list = (store.daily_backups || [])
      .map(b => ({ id: b.id, date: b.date, created_at: b.created_at, summary: b.summary }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    res.json({ success: true, backups: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DETALLE COMPLETO DE UN BACKUP DIARIO PUNTUAL (para ver en pantalla).
app.get('/api/admin/backups/:id', (req, res) => {
  try {
    const store = db.getStore();
    const backup = (store.daily_backups || []).find(b => b.id === req.params.id);
    if (!backup) {
      return res.status(404).json({ success: false, error: 'No hay un backup guardado para esa fecha.' });
    }
    res.json({ success: true, backup });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DESCARGA EL BACKUP DIARIO COMO EXCEL DE VARIAS SOLAPAS (Turnos, Ventas,
// Pagos Cta Cte, Anulaciones y Cambios de Forma de Pago, Resumen).
app.get('/api/admin/backups/:id/excel', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const store = db.getStore();
    const backup = (store.daily_backups || []).find(b => b.id === req.params.id);
    if (!backup) {
      return res.status(404).json({ success: false, error: 'No hay un backup guardado para esa fecha.' });
    }

    const wb = XLSX.utils.book_new();

    const wsTurnos = XLSX.utils.json_to_sheet((backup.cash_shifts || []).map(s => ({
      'Caja N°': s.box_number, 'Cajero/a': s.cashier_name, 'Tipo': s.shift_type,
      'Apertura': s.opened_at, 'Cierre': s.closed_at, 'Efectivo Inicial': s.initial_cash,
      'Efectivo Final': s.final_cash, 'Abierto por': s.opened_by, 'Cerrado por': s.closed_by || '',
      'Estado': s.status
    })));
    XLSX.utils.book_append_sheet(wb, wsTurnos, 'Turnos de Caja');

    const wsVentas = XLSX.utils.json_to_sheet((backup.orders || []).map(o => ({
      'N° Orden': o.order_number, 'Cliente': o.customer_name, 'Total': o.total,
      'Forma de Pago': o.payment_method, 'Estado': o.status, 'Cobrado': o.paid ? 'Sí' : 'No',
      'Hora': o.created_at
    })));
    XLSX.utils.book_append_sheet(wb, wsVentas, 'Ventas del Día');

    const wsCC = XLSX.utils.json_to_sheet((backup.account_payments || []).map(p => ({
      'Cliente': p.customer_name, 'Monto': p.amount, 'Tipo': p.type, 'Notas': p.notes, 'Hora': p.date
    })));
    XLSX.utils.book_append_sheet(wb, wsCC, 'Pagos Cta Cte');

    const wsAnul = XLSX.utils.json_to_sheet((backup.cancellations || []).map(o => ({
      'N° Orden': o.order_number, 'Total': o.total, 'Motivo': o.cancelled_reason,
      'Anulado por': o.cancelled_by, 'Hora Anulación': o.cancelled_at,
      'Estado Previo': o.status_before_cancel, 'Desde Caja': o.cancelled_from_caja ? 'Sí' : 'No (Cocina)'
    })));
    XLSX.utils.book_append_sheet(wb, wsAnul, 'Anulaciones');

    const wsCambios = XLSX.utils.json_to_sheet((backup.payment_changes || []).map(c => ({
      'N° Orden': c.order_number, 'Antes': c.from, 'Ahora': c.to, 'Motivo': c.reason,
      'Cambiado por': c.changed_by, 'Hora': c.changed_at
    })));
    XLSX.utils.book_append_sheet(wb, wsCambios, 'Cambios Forma de Pago');

    const wsResumen = XLSX.utils.json_to_sheet([backup.summary]);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="backup_caja_${backup.date}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// NOTIFICACIÓN DE INCIDENTE / FALTA DE INSUMO EN BARRA CON ALERTA A CAJA
app.post('/api/bar/orders/:id/incident', (req, res) => {
  try {
    const { id } = req.params;
    const { reason, note, barista_name } = req.body;

    const store = db.getStore();
    const order = store.orders.find(o => o.id === parseInt(id));
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    order.bar_status = 'en_proceso';
    order.bar_incident_reason = reason || 'Falta de Insumo';
    order.bar_incident_note = note || '';
    order.bar_incident_by = barista_name || 'Barista';
    order.bar_incident_at = new Date().toISOString();
    order.updated_at = new Date().toISOString();

    db.saveStore();

    const updatedOrder = {
      ...order,
      items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
    };

    io.emit('order_updated', updatedOrder);
    io.emit('bar_incident_alert', {
      order_id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      reason: order.bar_incident_reason,
      note: order.bar_incident_note,
      barista_name: order.bar_incident_by,
      time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    });

    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/orders/:id/paid', (req, res) => {
  try {
    const { id } = req.params;
    const { paid } = req.body;

    const store = db.getStore();
    const order = store.orders.find(o => o.id === parseInt(id));
    if (order) {
      // Un pedido anulado no puede marcarse como cobrado/ingresado a caja:
      // el botón ya queda deshabilitado en la interfaz, esto es el mismo
      // resguardo del lado del servidor.
      if (order.status === 'cancelado') {
        return res.status(400).json({
          success: false,
          error: `El pedido ${order.order_number} está ANULADO, no se puede modificar su ingreso a Caja.`
        });
      }
      order.paid = paid ? 1 : 0;
      order.updated_at = new Date().toISOString();
      db.saveStore();

      const updatedOrder = {
        ...order,
        items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
      };
      io.emit('order_updated', updatedOrder);
      return res.json({ success: true, order: updatedOrder });
    }
    res.status(404).json({ success: false, error: 'Pedido no encontrado' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GESTIÓN DE SOCIOS DEL CLUB Y REGISTRO CENTRALIZADO DE PUNTOS
app.get('/api/admin/customers', (req, res) => {
  try {
    const store = db.getStore();
    res.json({
      success: true,
      customers: store.customers || [],
      settings: getSettingsMap()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/customers/adjust-points', (req, res) => {
  try {
    const { customer_id, points_change, reason, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La acreditación o ajuste manual de puntos requiere PIN de Encargado (Nivel 2) o Gerente (Nivel 3).' });
    }

    const store = db.getStore();
    const customer = (store.customers || []).find(c => c.id === parseInt(customer_id));

    if (!customer) {
      return res.status(404).json({ success: false, error: 'Socio no encontrado en la base de datos.' });
    }

    const changeNum = parseInt(points_change || 0);
    if (changeNum === 0) {
      return res.status(400).json({ success: false, error: 'La cantidad de puntos a ajustar debe ser distinta de 0.' });
    }

    customer.points = Math.max(0, (customer.points || 0) + changeNum);
    if (!customer.history) customer.history = [];

    customer.history.unshift({
      date: new Date().toISOString(),
      description: `⭐ Ajuste Manual por ${auth.user.name}: ${reason || 'Acreditación especial de puntos'}`,
      points_change: changeNum,
      type: 'manual_adjustment'
    });

    db.saveStore();
    io.emit('customer_updated', customer);

    res.json({ success: true, customer, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// APIS DE MERCADERÍA, INSUMOS Y PROVEEDORES
// (suppliers / supplier_products / supplier_purchases se leen desde la base
// de datos separada db_suppliers.js, no desde el store general)
app.get('/api/admin/stock', async (req, res) => {
  try {
    const store = db.getStore();
    const [suppliers, supplierProducts, supplierPurchases, semiElaborados, semiRecipes, semiProductionEntries] = await Promise.all([
      dbSuppliers.listSuppliers(),
      dbSuppliers.listSupplierProducts(),
      dbSuppliers.listSupplierPurchases(),
      dbSemi.listSemiElaborados(),
      dbSemi.listAllSemiElaboradoRecipes(),
      dbSemi.listSemiProductionEntries(100)
    ]);
    res.json({
      success: true,
      suppliers,
      raw_materials: store.raw_materials || [],
      product_recipes: store.product_recipes || [],
      stock_entries: store.stock_entries || [],
      stock_adjustments: store.stock_adjustments || [],
      production_entries: store.production_entries || [],
      supplier_products: supplierProducts,
      supplier_purchases: supplierPurchases,
      semi_elaborados: semiElaborados,
      semi_elaborado_recipes: semiRecipes,
      semi_production_entries: semiProductionEntries
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS DE CUENTAS CORRIENTES (REQUERIDO NIVEL 3 - GERENTE / DUEÑO)
app.get('/api/admin/accounts', (req, res) => {
  try {
    const store = db.getStore();
    res.json({ 
      success: true, 
      accounts: store.customer_accounts || [],
      payments: store.account_payments || []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/accounts', async (req, res) => {
  try {
    const { id, name, dni, phone, address, payment_term, credit_limit, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La apertura y gestión de Cuentas Corrientes requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    if (!name || !dni || !phone) {
      return res.status(400).json({ success: false, error: 'Nombre, DNI y Teléfono son obligatorios' });
    }

    const store = db.getStore();
    if (id) {
      const acc = store.customer_accounts.find(a => a.id === parseInt(id));
      if (acc) {
        acc.name = name;
        acc.dni = dni;
        acc.phone = phone;
        acc.address = address || '';
        acc.payment_term = payment_term || 'quincenal';
        acc.credit_limit = parseFloat(credit_limit || 20000);
      }
    } else {
      const nextId = store.customer_accounts.length > 0 ? Math.max(...store.customer_accounts.map(a => a.id)) + 1 : 1;
      store.customer_accounts.push({
        id: nextId,
        name,
        dni,
        phone,
        address: address || '',
        payment_term: payment_term || 'quincenal',
        credit_limit: parseFloat(credit_limit || 20000),
        balance: 0,
        status: 'active',
        created_at: new Date().toISOString()
      });
    }
    // Guardado CON confirmación (ver nota en POST /api/orders): dar de alta
    // un cliente en cuenta corriente tampoco puede quedar solo en memoria.
    await db.saveStoreAndConfirm();

    res.json({ success: true, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/accounts/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, payment_type, notes } = req.body;

    const store = db.getStore();
    const account = store.customer_accounts.find(a => a.id === parseInt(id));
    if (!account) {
      return res.status(404).json({ success: false, error: 'Cuenta de cliente no encontrada' });
    }

    const payAmount = parseFloat(amount || 0);
    if (payAmount <= 0) {
      return res.status(400).json({ success: false, error: 'El monto ingresado debe ser mayor a $0' });
    }

    account.balance = Math.max(0, (account.balance || 0) - payAmount);

    const nextPaymentId = store.account_payments.length > 0 ? Math.max(...store.account_payments.map(p => p.id)) + 1 : 1;
    store.account_payments.unshift({
      id: nextPaymentId,
      account_id: account.id,
      customer_name: account.name,
      amount: payAmount,
      type: payment_type || 'parcial',
      notes: notes || '',
      date: new Date().toISOString()
    });

    const totalOrders = store.orders.length;
    const orderNumber = `#PAGO-CC-${101 + totalOrders}`;

    store.orders.unshift({
      id: store.orders.length > 0 ? Math.max(...store.orders.map(o => o.id)) + 1 : 1,
      order_number: orderNumber,
      customer_name: `COBRO CC: ${account.name}`,
      customer_phone: account.phone,
      address: account.address,
      delivery_type: 'retiro',
      payment_method: 'Efectivo',
      payment_note: `Pago ${payment_type === 'total' ? 'Total' : 'Parcial'} Cuenta Corriente`,
      notes: notes || `Ingreso de cobro a cuenta corriente de ${account.name}`,
      items: JSON.stringify([{ name: `Cobro Cuenta Corriente (${payment_type})`, qty: 1, price: payAmount }]),
      total: payAmount,
      status: 'entregado',
      paid: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Guardado CON confirmación (ver nota en POST /api/orders): un cobro de
    // cuenta corriente tampoco puede quedar solo en memoria.
    await db.saveStoreAndConfirm();
    io.emit('order_updated');

    res.json({ success: true, account });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cash/summary', (req, res) => {
  try {
    const store = db.getStore();
    const rawOrders = store.orders.filter(o => o.status !== 'cancelado');

    let totalSales = 0;
    let cashTotal = 0;
    let cashCollected = 0;
    let cashPending = 0;
    let cardTotal = 0;
    let digitalTotal = 0;

    const orders = rawOrders.map(o => {
      const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
      const isPaid = o.paid === 1;
      const total = o.total;

      totalSales += total;

      if (o.payment_method === 'Efectivo') {
        cashTotal += total;
        if (isPaid) {
          cashCollected += total;
        } else {
          cashPending += total;
        }
      } else if (o.payment_method.includes('Tarjeta') || o.payment_method.toLowerCase().includes('posnet')) {
        // El Posnet de MercadoPago es tarjeta tapada/pasada por una terminal
        // física (igual que un posnet bancario) -> se cuadra junto con
        // "Tarjetas (Posnet)", no junto con MercadoPago QR/transferencia.
        cardTotal += total;
      } else {
        digitalTotal += total;
      }

      return {
        ...o,
        items
      };
    });

    const activeShifts = (store.cash_shifts || []).filter(s => s.status === 'open');
    const openBoxNumbers = activeShifts.map(s => s.box_number || 1);

    res.json({
      success: true,
      active_shift: activeShifts.length > 0 ? activeShifts[0] : null,
      active_shifts: activeShifts,
      open_box_numbers: openBoxNumbers,
      summary: {
        total_sales: totalSales,
        cash_total: cashTotal,
        cash_collected: cashCollected,
        cash_pending: cashPending,
        card_total: cardTotal,
        digital_total: digitalTotal,
        orders_count: orders.length
      },
      orders
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/print-epson/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const store = db.getStore();
    const order = store.orders.find(o => o.id === parseInt(id));
    if (!order) return res.status(404).json({ success: false, error: 'Pedido no encontrado' });

    order.items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;

    const settings = getSettingsMap();
    const printerIp = req.body.printer_ip || settings.epson_printer_ip;
    const printerPort = parseInt(req.body.printer_port || settings.epson_printer_port || 9100);

    if (!printerIp) {
      return res.status(400).json({ success: false, error: 'No se ha configurado la IP de la impresora Epson' });
    }

    await printToEpsonNetwork(order, printerIp, printerPort);
    res.json({ success: true, message: `Ticket enviado a impresora Epson en ${printerIp}:${printerPort}` });
  } catch (err) {
    console.error('Error al imprimir en Epson:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

function printToEpsonNetwork(order, ip, port = 9100) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);

    client.connect(port, ip, () => {
      const ESC = '\x1B';
      const GS = '\x1D';

      let buffer = '';
      buffer += ESC + '@';
      buffer += ESC + 'a' + '\x01';
      buffer += ESC + '!' + '\x38';
      buffer += `COMANDA - COCINA\n`;
      buffer += ESC + '!' + '\x00';
      buffer += `--------------------------------\n`;

      buffer += ESC + 'a' + '\x00';
      buffer += `ORDEN: ${order.order_number}\n`;
      buffer += `FECHA: ${new Date().toLocaleString('es-AR')}\n`;
      buffer += `CLIENTE: ${order.customer_name}\n`;
      buffer += `TEL: ${order.customer_phone}\n`;
      buffer += `TIPO: ${order.delivery_type === 'delivery' ? 'DELIVERY A DOMICILIO' : 'RETIRO EN LOCAL'}\n`;
      if (order.address) buffer += `DIR: ${order.address}\n`;
      buffer += `PAGO: ${order.payment_method} ${order.payment_note ? `(${order.payment_note})` : ''}\n`;
      buffer += `ESTADO CAJA: ${order.paid ? 'COBRADO EN CAJA [OK]' : 'PENDIENTE DE COBRO'}\n`;
      buffer += `--------------------------------\n`;

      buffer += ESC + '!' + '\x08';
      buffer += `CANT  PRODUCTO                    TOTAL\n`;
      buffer += ESC + '!' + '\x00';

      if (Array.isArray(order.items)) {
        order.items.forEach(item => {
          const qty = `${item.qty}x`.padEnd(5);
          const name = item.name.substring(0, 20).padEnd(20);
          const total = `$${Math.round(item.price * item.qty)}`.padStart(7);
          buffer += `${qty}${name}${total}\n`;
        });
      }

      buffer += `--------------------------------\n`;
      if (order.notes) {
        buffer += ESC + '!' + '\x08';
        buffer += `NOTAS: ${order.notes}\n`;
        buffer += ESC + '!' + '\x00';
        buffer += `--------------------------------\n`;
      }

      buffer += ESC + 'a' + '\x02';
      buffer += ESC + '!' + '\x20';
      buffer += `TOTAL: $${Math.round(order.total)}\n`;
      buffer += ESC + '!' + '\x00';

      buffer += ESC + 'a' + '\x01';
      buffer += `\n-- La Gran Rotiseria --\n\n\n\n`;

      buffer += GS + 'V' + '\x41' + '\x03';

      client.write(Buffer.from(buffer, 'latin1'), () => {
        client.end();
        resolve();
      });
    });

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Tiempo de espera agotado al conectar con la impresora Epson'));
    });
  });
}

// RUTAS API PRODUCTOS & CATEGORÍAS (REQUERIDO NIVEL 3 - GERENTE / DUEÑO)
app.get('/api/admin/products', (req, res) => {
  try {
    const store = db.getStore();
    const products = store.products.map(p => {
      const cat = store.categories.find(c => c.id === p.category_id);
      return {
        ...p,
        category_name: cat ? cat.name : 'Sin categoría',
        category_icon: cat ? cat.icon : '🍽️'
      };
    });
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/products', async (req, res) => {
  try {
    const { id, code, category_id, name, description, price, image_url, video_url, points_cost, available, barcode, plu_code, unit_type, is_weighed, descuento_pct, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La modificación del menú requiere PIN de Encargado (Nivel 2) o superior.' });
    }

    const store = db.getStore();
    const strCode = code ? String(code).trim().toUpperCase() : '';
    const strBarcode = barcode ? String(barcode).trim() : '';
    const strPlu = plu_code ? String(plu_code).trim() : '';

    // Con PIN de Nivel 2 (Encargado) se puede editar cualquier dato de un plato
    // YA EXISTENTE (nombre, descripción, foto, categoría, disponibilidad, etc.).
    // Lo único que sigue exigiendo el PIN de Gerente / Dueño (Nivel 3) es tocar
    // el PRECIO, y crear un plato nuevo desde cero — así quedó acordado con el
    // dueño.
    if (auth.user.level < 3) {
      const existingProd = id ? store.products.find(p => p.id === parseInt(id)) : null;
      if (!existingProd) {
        return res.status(401).json({ success: false, error: 'Acceso Denegado: crear un plato nuevo requiere PIN de Gerente / Dueño (Nivel 3).' });
      }

      const incomingPrice = parseFloat(price);
      if (incomingPrice !== existingProd.price) {
        return res.status(401).json({ success: false, error: 'Acceso Denegado: cambiar el PRECIO de un plato requiere PIN de Gerente / Dueño (Nivel 3).' });
      }
    }

    if (strCode) {
      const dupCode = store.products.find(p => p.code === strCode && p.id !== parseInt(id || 0));
      if (dupCode) {
        return res.status(400).json({ success: false, error: `⚠️ CÓDIGO SKU DUPLICADO: El código "${strCode}" ya pertenece al plato "${dupCode.name}".` });
      }
    }

    if (strBarcode) {
      const dup = store.products.find(p => p.barcode === strBarcode && p.id !== parseInt(id || 0));
      if (dup) {
        return res.status(400).json({ success: false, error: `⚠️ CÓDIGO DE BARRAS DUPLICADO: El código "${strBarcode}" ya pertenece al plato "${dup.name}".` });
      }
    }

    if (strPlu) {
      const dupPlu = store.products.find(p => p.plu_code === strPlu && p.id !== parseInt(id || 0));
      if (dupPlu) {
        return res.status(400).json({ success: false, error: `⚠️ CÓDIGO PLU DUPLICADO: El código PLU "${strPlu}" ya pertenece al plato "${dupPlu.name}".` });
      }
    }

    if (name) {
      const dupName = store.products.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase() && p.id !== parseInt(id || 0));
      if (dupName) {
        return res.status(400).json({ success: false, error: `⚠️ PRODUCTO DUPLICADO: Ya existe un plato o bebida registrado con el nombre "${dupName.name}".` });
      }
    }

    if (id) {
      const prod = store.products.find(p => p.id === parseInt(id));
      if (prod) {
        prod.code = strCode || prod.code || `PROD-${String(prod.id).padStart(3, '0')}`;
        prod.category_id = parseInt(category_id);
        prod.name = name;
        prod.description = description;
        prod.price = parseFloat(price);
        const dPct = Math.min(99, Math.max(0, parseInt(descuento_pct) || 0));
        prod.descuento_pct = dPct;
        prod.precio_promo = dPct > 0 ? Math.round(prod.price * (1 - dPct / 100)) : prod.price;
        prod.image_url = image_url;
        prod.video_url = video_url || '';
        prod.points_cost = points_cost ? parseInt(points_cost) : null;
        prod.available = available ? 1 : 0;
        prod.barcode = strBarcode;
        prod.plu_code = strPlu;
        prod.unit_type = unit_type || 'unidad';
        prod.is_weighed = is_weighed ? 1 : 0;
      }
    } else {
      const nextId = store.products.length > 0 ? Math.max(...store.products.map(p => p.id)) + 1 : 1;
      const finalCode = strCode || `PROD-${String(nextId).padStart(3, '0')}`;
      const newDPct = Math.min(99, Math.max(0, parseInt(descuento_pct) || 0));
      const newPrice = parseFloat(price);
      store.products.push({
        id: nextId,
        code: finalCode,
        category_id: parseInt(category_id),
        name,
        description,
        price: newPrice,
        descuento_pct: newDPct,
        precio_promo: newDPct > 0 ? Math.round(newPrice * (1 - newDPct / 100)) : newPrice,
        image_url,
        video_url: video_url || '',
        points_cost: points_cost ? parseInt(points_cost) : null,
        available: available !== undefined ? (available ? 1 : 0) : 1,
        barcode: strBarcode,
        plu_code: strPlu,
        unit_type: unit_type || 'unidad',
        is_weighed: is_weighed ? 1 : 0
      });
    }
    await db.saveStoreAndConfirm();
    io.emit('menu_updated');
    res.json({ success: true, user_name: auth.user.name });
  } catch (err) {
    console.error('⚠️ Error al guardar producto:', err.message);
    res.status(500).json({ success: false, error: 'No se pudo guardar en la base de datos: ' + err.message });
  }
});

// Sube la foto de un producto a Supabase Storage y devuelve el link público,
// para guardar SOLO el link en el producto en vez de la foto incrustada
// (ver storage.js para el porqué). Si Supabase Storage no está configurado
// todavía, devuelve un error claro y el panel sigue funcionando como antes
// (guardando la foto incrustada).
app.post('/api/admin/upload-image', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: 'Falta la imagen.' });
    }
    const url = await storage.uploadProductImage(image);
    res.json({ success: true, url });
  } catch (err) {
    console.error('⚠️ Error al subir imagen a Supabase Storage:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pausar / reactivar un plato (botón "🟢 Activo / 🔴 Pausado" del panel de
// productos). Faltaba esta ruta en el servidor: el botón del panel ya
// llamaba a PUT /api/admin/products/:id/toggle pero como no existía,
// el pedido fallaba (404) sin avisar nada visible en pantalla.
app.put('/api/admin/products/:id/toggle', (req, res) => {
  try {
    const store = db.getStore();
    const prod = store.products.find(p => p.id === parseInt(req.params.id));
    if (!prod) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
    }
    const isAvail = prod.available === 1 || prod.available === true || prod.available === '1';
    prod.available = isAvail ? 0 : 1;
    db.saveStore();
    io.emit('menu_updated');
    res.json({ success: true, available: prod.available });
  } catch (err) {
    console.error('⚠️ Error al pausar/activar producto:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Eliminar un plato (botón 🗑️ del panel de productos). Tampoco existía esta
// ruta: el botón llamaba a DELETE /api/admin/products/:id sin resultado.
app.delete('/api/admin/products/:id', (req, res) => {
  try {
    const store = db.getStore();
    const idx = store.products.findIndex(p => p.id === parseInt(req.params.id));
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
    }
    store.products.splice(idx, 1);
    db.saveStore();
    io.emit('menu_updated');
    res.json({ success: true });
  } catch (err) {
    console.error('⚠️ Error al eliminar producto:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTAS API GESTIÓN MODULAR DE CATEGORÍAS (REQUERIDO NIVEL 3 - GERENTE / DUEÑO)
app.post('/api/admin/categories', (req, res) => {
  try {
    const { id, name, icon, sector, sort_order, pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: La gestión modular de categorías requiere PIN de Gerente / Dueño (Nivel 3).' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio.' });
    }

    const store = db.getStore();
    if (!store.categories) store.categories = [];

    const strName = name.trim();
    const strIcon = (icon || '🍽️').trim();

    const dupCat = store.categories.find(c => c.name.toLowerCase() === strName.toLowerCase() && c.id !== parseInt(id || 0));
    if (dupCat) {
      return res.status(400).json({ success: false, error: `⚠️ CATEGORÍA DUPLICADA: Ya existe una categoría con el nombre "${dupCat.name}".` });
    }

    if (id) {
      const cat = store.categories.find(c => c.id === parseInt(id));
      if (cat) {
        cat.name = strName;
        cat.icon = strIcon;
        if (sector) cat.sector = sector;
        if (sort_order !== undefined) cat.sort_order = parseInt(sort_order);
      }
    } else {
      const nextId = store.categories.length > 0 ? Math.max(...store.categories.map(c => c.id)) + 1 : 1;
      store.categories.push({
        id: nextId,
        name: strName,
        icon: strIcon,
        sort_order: sort_order !== undefined ? parseInt(sort_order) : store.categories.length,
        sector: sector || 'kitchen'
      });
    }

    db.saveStore();
    io.emit('menu_updated');
    res.json({ success: true, categories: store.categories, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/categories/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { pin } = req.body;

    const auth = verifyUserPin(pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Se requiere PIN Nivel 3 para eliminar categorías.' });
    }

    const store = db.getStore();
    const cid = parseInt(id);

    const prodsInCat = store.products.filter(p => p.category_id === cid);
    if (prodsInCat.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `⚠️ NO SE PUEDE ELIMINAR: La categoría contiene ${prodsInCat.length} plato(s) o producto(s). Reasigne o elimine esos productos antes de borrar la categoría.` 
      });
    }

    store.categories = store.categories.filter(c => c.id !== cid);
    db.saveStore();
    io.emit('menu_updated');

    res.json({ success: true, categories: store.categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// RUTA API POS: VENTA DIRECTA EN MOSTRADOR POR ESCÁNER / BALANZA
app.post('/api/pos/sale', async (req, res) => {
  try {
    const { items, payment_method, payment_note, payments, cashier_name, box_number, total } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0 || !total) {
      return res.status(400).json({ success: false, error: 'El carrito de venta directa no puede estar vacío.' });
    }

    // Pago combinado: `payments` es opcional, un array [{method, amount, note?}, ...]
    // (ej: parte Efectivo + parte Tarjeta). Si viene, tiene que sumar exacto
    // el total de la venta. Si no viene, se usa el `payment_method` único de
    // siempre (compatibilidad con lo que ya existía).
    let combinedPayments = null;
    let paymentMethodSummary = payment_method || 'Efectivo';
    if (payments && Array.isArray(payments) && payments.length > 0) {
      const cleanPayments = payments
        .map(p => ({ method: String(p.method || '').trim(), amount: parseFloat(p.amount) || 0, note: (p.note || '').trim() }))
        .filter(p => p.method && p.amount > 0);
      if (cleanPayments.length === 0) {
        return res.status(400).json({ success: false, error: 'Los pagos combinados ingresados no son válidos.' });
      }
      const sumPayments = cleanPayments.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(sumPayments - parseFloat(total)) > 1) { // tolerancia de $1 por redondeo
        return res.status(400).json({
          success: false,
          error: `⚠️ Los pagos combinados suman $${sumPayments} y el total de la venta es $${total}. Tienen que coincidir.`
        });
      }
      combinedPayments = cleanPayments;
      paymentMethodSummary = cleanPayments.length > 1
        ? cleanPayments.map(p => `${p.method} ($${p.amount})`).join(' + ')
        : cleanPayments[0].method;
    }

    const store = db.getStore();
    const numBox = parseInt(box_number || 1);

    const activeShift = (store.cash_shifts || []).find(s => s.status === 'open' && (s.box_number || 1) === numBox);
    if (!activeShift) {
      return res.status(400).json({ success: false, error: `⚠️ NO HAY TURNO DE CAJA ABIERTO: Debe abrir la Caja N° ${numBox} antes de realizar cobros directos.` });
    }

    const totalOrders = store.orders.length;
    const orderNumber = `#POS-${101 + totalOrders}`;

    const strCashier = cashier_name || activeShift.cashier_name || activeShift.opened_by || 'Cajero';

    const newOrder = {
      id: store.orders.length > 0 ? Math.max(...store.orders.map(o => o.id)) + 1 : 1,
      order_number: orderNumber,
      customer_name: `VENTA DIRECTA MOSTRADOR (${strCashier})`,
      customer_phone: 'En Local',
      address: 'Venta Directa en Mostrador',
      delivery_type: 'retiro',
      payment_method: paymentMethodSummary,
      payment_note: payment_note || `Caja N° ${numBox}`,
      payments: combinedPayments, // null si fue un único medio de pago
      notes: `Venta Directa POS cobrada por ${strCashier} en Caja N° ${numBox}`,
      items: typeof items === 'string' ? items : JSON.stringify(items),
      total: parseFloat(total),
      status: 'entregado',
      paid: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Descontar materias primas, Pre-Armados y/o stock de comida preparada si aplica
    for (const item of items) {
      const qtySold = parseFloat(item.qty || 1);
      const prod = store.products.find(p => p.id === item.id);
      if (prod && prod.stock_prepared !== undefined) {
        prod.stock_prepared = Math.max(0, parseFloat((prod.stock_prepared - qtySold).toFixed(3)));
      }

      await deductProductRecipeComponents(store, item.id, qtySold);
    }

    store.orders.unshift(newOrder);
    // Guardado CON confirmación (ver nota en POST /api/orders): una venta de
    // mostrador cobrada en caja no puede quedar "guardada" solo en memoria.
    await db.saveStoreAndConfirm();

    io.emit('new_order', newOrder);
    io.emit('order_updated', newOrder);
    io.emit('cash_shift_updated');

    // Auto-imprimir ticket si está configurado
    const settings = getSettingsMap();
    if (settings.auto_print_epson === '1' && settings.epson_printer_ip) {
      printToEpsonNetwork(newOrder, settings.epson_printer_ip, settings.epson_printer_port || 9100)
        .then(() => console.log(`🖨️ Ticket POS ${orderNumber} impreso en Epson ${settings.epson_printer_ip}`))
        .catch(err => console.error(`⚠️ Error al imprimir POS en Epson: ${err.message}`));
    }

    res.json({ success: true, order: newOrder });
  } catch (err) {
    console.error('Error al procesar venta directa POS:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// APIS DE GESTIÓN DE TURNO DE BAR & CAFETERÍA
// ==========================================

app.get('/api/bar/shift', (req, res) => {
  try {
    const store = db.getStore();
    const shifts = store.bar_shifts || [];
    const activeShift = shifts.find(s => s.status === 'open') || null;
    res.json({ success: true, active_shift: activeShift, history: shifts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bar/shift/open', (req, res) => {
  try {
    const { barista_name, shift_name, pin } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: '⚠️ PIN personal no válido. Ingresa tu clave registrada.' });
    }

    const store = db.getStore();
    if (!store.bar_shifts) store.bar_shifts = [];
    if (!store.cash_shifts) store.cash_shifts = [];

    // REGLA DE NEGOCIO DEL BAR:
    // El Bar no tiene caja propia, recibe tickets generados en Caja al momento de cobrar.
    // Por lo tanto, NO se puede abrir el Bar si no hay al menos una Estación de Caja Abierta.
    // (La Cocina sí puede abrir sin caja para producción previa).
    const activeCashShift = store.cash_shifts.find(s => s.status === 'open');
    if (!activeCashShift) {
      return res.status(400).json({
        success: false,
        error: '⚠️ REGLA DE APERTURA DE BAR: No se puede abrir el Turno de Bar si no hay ninguna Estación de Caja Abierta.\n\nEl Bar elabora en el momento los tickets emitidos al cobrar. Abre primero la Caja N° 1.'
      });
    }

    const existingOpen = store.bar_shifts.find(s => s.status === 'open');
    if (existingOpen) {
      return res.status(400).json({ success: false, error: `⚠️ Ya existe un Turno de Bar Abierto a nombre de "${existingOpen.barista_name}". Ciérralo antes de abrir uno nuevo.` });
    }

    const nextId = store.bar_shifts.length > 0 ? Math.max(...store.bar_shifts.map(s => s.id)) + 1 : 1;
    const newShift = {
      id: nextId,
      barista_name: barista_name || auth.user.name,
      shift_name: shift_name || 'Turno Bar',
      opened_at: new Date().toISOString(),
      closed_at: null,
      opened_by: auth.user.name,
      user_id: auth.user.id,
      status: 'open'
    };

    store.bar_shifts.unshift(newShift);
    db.saveStore();
    io.emit('bar_shift_updated', newShift);

    res.json({ success: true, shift: newShift, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/bar/shift/close', (req, res) => {
  try {
    const { pin } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: '⚠️ PIN personal no válido. Ingresa tu clave registrada.' });
    }

    const store = db.getStore();
    if (!store.bar_shifts) store.bar_shifts = [];

    const activeShift = store.bar_shifts.find(s => s.status === 'open');
    if (!activeShift) {
      return res.status(400).json({ success: false, error: '⚠️ No hay ningún turno de Bar abierto para cerrar.' });
    }

    activeShift.status = 'closed';
    activeShift.closed_at = new Date().toISOString();
    activeShift.closed_by = auth.user.name;

    db.saveStore();
    io.emit('bar_shift_updated', activeShift);

    res.json({ success: true, shift: activeShift, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// APIS DE FICHAJE DE ASISTENCIA Y CÓMPUTO DE HORAS TRABAJADAS
// ==========================================

app.get('/api/attendance/logs', (req, res) => {
  try {
    const store = db.getStore();
    const logs = store.attendance_logs || [];
    const activeStaff = logs.filter(l => l.status === 'active');
    res.json({ success: true, logs, active_staff: activeStaff });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/attendance/clock-in', (req, res) => {
  try {
    const { pin, sector } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: '⚠️ PIN personal no válido. Ingresa tu clave registrada.' });
    }

    const store = db.getStore();
    if (!store.attendance_logs) store.attendance_logs = [];

    const existingActive = store.attendance_logs.find(l => l.user_id === auth.user.id && l.status === 'active');
    if (existingActive) {
      const since = new Date(existingActive.clock_in).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return res.status(400).json({ success: false, error: `⚠️ "${auth.user.name}" ya tiene un turno abierto desde las ${since} hs. Marca salida antes de ingresar un nuevo turno.` });
    }

    const nextId = store.attendance_logs.length > 0 ? Math.max(...store.attendance_logs.map(l => l.id)) + 1 : 1;
    const newLog = {
      id: nextId,
      user_id: auth.user.id,
      user_name: auth.user.name,
      level: auth.user.level,
      sector: sector || (auth.user.level === 3 ? 'Administración' : auth.user.level === 2 ? 'Encargado' : 'General'),
      clock_in: new Date().toISOString(),
      clock_out: null,
      hours_worked: 0,
      status: 'active'
    };

    store.attendance_logs.unshift(newLog);
    db.saveStore();
    io.emit('attendance_updated');

    res.json({ success: true, log: newLog, user_name: auth.user.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/attendance/clock-out', (req, res) => {
  try {
    const { pin } = req.body;
    const auth = verifyUserPin(pin, 1);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: '⚠️ PIN personal no válido. Ingresa tu clave registrada.' });
    }

    const store = db.getStore();
    if (!store.attendance_logs) store.attendance_logs = [];

    const activeLog = store.attendance_logs.find(l => l.user_id === auth.user.id && l.status === 'active');
    if (!activeLog) {
      return res.status(400).json({ success: false, error: `⚠️ No se encontró ningún turno activo para "${auth.user.name}". Debes marcar ingreso primero.` });
    }

    const clockOutDate = new Date();
    const clockInDate = new Date(activeLog.clock_in);
    const diffMs = clockOutDate - clockInDate;
    const hours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

    activeLog.clock_out = clockOutDate.toISOString();
    activeLog.hours_worked = hours;
    activeLog.status = 'completed';

    db.saveStore();
    io.emit('attendance_updated');

    res.json({ success: true, log: activeLog, user_name: auth.user.name, hours_worked: hours });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// API CLUB DE PUNTOS Y CLIENTES (ESTILO CLUB GRIDO)
// ==========================================

app.post('/api/customer/sync', (req, res) => {
  try {
    const { dni, name, phone, address } = req.body;
    if (!dni) return res.status(400).json({ success: false, error: 'El DNI es obligatorio' });

    const store = db.getStore();
    if (!store.club_customers) store.club_customers = [];

    const strDni = String(dni).trim();
    let cust = store.club_customers.find(c => String(c.dni).trim() === strDni);

    if (!cust) {
      const nextId = store.club_customers.length > 0 ? Math.max(...store.club_customers.map(c => c.id)) + 1 : 1;
      cust = {
        id: nextId,
        dni: strDni,
        name: name || 'Cliente Club',
        phone: phone || '',
        addresses: address ? [{ id: 1, text: address, tag: 'Casa' }] : [{ id: 1, text: 'España 1028 (Casi Yrigoyen)', tag: 'Local Retiro' }],
        points_balance: 100, // Bono de bienvenida
        barcode: `CLI-${strDni}`,
        created_at: new Date().toISOString()
      };
      store.club_customers.push(cust);

      if (!store.points_history) store.points_history = [];
      store.points_history.unshift({
        id: Date.now(),
        customer_dni: strDni,
        type: 'earn',
        points: 100,
        description: '🎁 Regalo de Bienvenida al Club La Gran Rotisería',
        date: new Date().toISOString()
      });

      db.saveStore();
    } else {
      if (name) cust.name = name;
      if (phone) cust.phone = phone;
      if (address && Array.isArray(cust.addresses)) {
        if (!cust.addresses.some(a => a.text === address)) {
          cust.addresses.push({ id: Date.now(), text: address, tag: 'Domicilio' });
        }
      }
      db.saveStore();
    }

    res.json({ success: true, customer: cust });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/customer/details/:dni', (req, res) => {
  try {
    const { dni } = req.params;
    const store = db.getStore();
    const strDni = String(dni).trim();
    const cust = (store.club_customers || []).find(c => String(c.dni).trim() === strDni);
    if (!cust) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const history = (store.points_history || []).filter(h => String(h.customer_dni).trim() === strDni);
    const coupons = store.coupons || [];

    res.json({ success: true, customer: cust, history, coupons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/customer/transfer-points', (req, res) => {
  try {
    const { from_dni, to_dni, points } = req.body;
    const numPoints = parseInt(points || 0);
    if (numPoints <= 0) return res.status(400).json({ success: false, error: 'La cantidad de puntos debe ser mayor a 0' });

    const store = db.getStore();
    const strFrom = String(from_dni).trim();
    const strTo = String(to_dni).trim();

    if (strFrom === strTo) return res.status(400).json({ success: false, error: 'No podés transferirte puntos a vos mismo' });

    const sender = (store.club_customers || []).find(c => String(c.dni).trim() === strFrom);
    const receiver = (store.club_customers || []).find(c => String(c.dni).trim() === strTo);

    if (!sender) return res.status(404).json({ success: false, error: 'Tu usuario emisor no existe en el sistema' });
    if (!receiver) return res.status(404).json({ success: false, error: `No se encontró ningún cliente registrado con DNI ${strTo}` });

    if ((sender.points_balance || 0) < numPoints) {
      return res.status(400).json({ success: false, error: `Saldo insuficiente. Tenés ${sender.points_balance || 0} puntos disponibles.` });
    }

    sender.points_balance -= numPoints;
    receiver.points_balance = (receiver.points_balance || 0) + numPoints;

    if (!store.points_history) store.points_history = [];
    const now = new Date().toISOString();
    store.points_history.unshift({
      id: Date.now(),
      customer_dni: strFrom,
      type: 'transfer_out',
      points: numPoints,
      description: `🔄 Transferencia enviada a DNI ${strTo} (${receiver.name})`,
      date: now
    });
    store.points_history.unshift({
      id: Date.now() + 1,
      customer_dni: strTo,
      type: 'transfer_in',
      points: numPoints,
      description: `🎁 Transferencia recibida de DNI ${strFrom} (${sender.name})`,
      date: now
    });

    db.saveStore();
    res.json({ success: true, sender_balance: sender.points_balance, receiver_name: receiver.name });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/customer/address', (req, res) => {
  try {
    const { dni, text, tag } = req.body;
    if (!dni || !text) return res.status(400).json({ success: false, error: 'DNI y Dirección son obligatorios' });

    const store = db.getStore();
    const strDni = String(dni).trim();
    const cust = (store.club_customers || []).find(c => String(c.dni).trim() === strDni);
    if (!cust) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });

    if (!cust.addresses) cust.addresses = [];
    const newAddr = { id: Date.now(), text: text.trim(), tag: tag || 'Domicilio' };
    cust.addresses.push(newAddr);
    db.saveStore();

    res.json({ success: true, addresses: cust.addresses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  try {
    // Nunca se devuelven las claves maestras acá: esta ruta solo requiere
    // sesión Nivel 2, y si admin_pin/encargado_pin viajaran en la
    // respuesta cualquier Encargado podría leer la clave maestra de
    // Nivel 3 con solo abrir la pestaña de Ajustes.
    const { admin_pin, encargado_pin, ...safeSettings } = getSettingsMap();
    res.json({ success: true, settings: safeSettings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Lista blanca de ajustes generales que se pueden guardar por esta vía
// (requiere sesión Nivel 2, sin PIN adicional). admin_pin y encargado_pin
// NUNCA pueden pasar por acá aunque vengan en el body: son las claves
// maestras de Nivel 2/3 y se cambian solo por /api/admin/master-pin, que
// exige la clave maestra Nivel 3 ACTUAL para poder cambiarlas. Si esto no
// estuviera restringido, cualquier Encargado (Nivel 2) podría mandar
// {"admin_pin":"lo-que-quiera"} y auto-otorgarse acceso de Nivel 3 sin
// conocer la clave real.
const SETTINGS_ALLOWED_KEYS = new Set([
  'restaurant_name', 'restaurant_address', 'whatsapp_phone', 'delivery_cost',
  'epson_printer_ip', 'epson_printer_port', 'auto_print_epson',
  'business_razon_social', 'business_description', 'business_domicilio_fiscal',
  'business_condicion_iva', 'business_logo_url'
]);

app.post('/api/settings', (req, res) => {
  try {
    const settings = req.body;
    const store = db.getStore();
    for (const [key, value] of Object.entries(settings)) {
      if (!SETTINGS_ALLOWED_KEYS.has(key)) continue; // ignorado en silencio: clave no permitida por esta vía
      store.settings[key] = String(value);
    }
    db.saveStore();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CAMBIO DE CLAVES MAESTRAS DE NIVEL 2 (ENCARGADO) Y NIVEL 3 (GERENTE/DUEÑO).
// Para cambiar CUALQUIERA de las dos hace falta la clave maestra Nivel 3
// ACTUAL (current_admin_pin) — así solo alguien que ya tiene acceso real de
// Nivel 3 puede cambiarlas, nunca un Encargado ni nadie que solo conozca la
// clave vieja de otra fuente. En cuanto se guarda la nueva clave, la vieja
// deja de servir en el acto (verifyUserPin siempre lee el valor actual).
app.post('/api/admin/master-pin', async (req, res) => {
  try {
    const { current_admin_pin, new_admin_pin, new_encargado_pin } = req.body;

    const auth = verifyUserPin(current_admin_pin, 3);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'Acceso Denegado: Para cambiar las claves maestras hace falta la clave actual de Gerente / Dueño (Nivel 3).' });
    }

    const store = db.getStore();
    if (!store.settings) store.settings = {};

    if (new_admin_pin !== undefined && new_admin_pin !== '') {
      const strNew = String(new_admin_pin).trim();
      if (!/^\d{4,8}$/.test(strNew)) {
        return res.status(400).json({ success: false, error: 'La nueva clave maestra de Nivel 3 tiene que ser numérica, de 4 a 8 dígitos.' });
      }
      store.settings.admin_pin = strNew;
    }
    if (new_encargado_pin !== undefined && new_encargado_pin !== '') {
      const strNew = String(new_encargado_pin).trim();
      if (!/^\d{4,8}$/.test(strNew)) {
        return res.status(400).json({ success: false, error: 'La nueva clave maestra de Nivel 2 tiene que ser numérica, de 4 a 8 dígitos.' });
      }
      store.settings.encargado_pin = strNew;
    }

    await db.saveStoreAndConfirm();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// FACTURACIÓN ELECTRÓNICA ARCA (Factura C / Tique C) - conexión directa,
// sin terceros. Los comprobantes emitidos se guardan en su propia base de
// datos separada (db_facturacion.js), no en el registro general.
// ==========================================

// Estado de la conexión con ARCA (para mostrar en el panel sin exponer
// nunca el certificado ni la clave privada)
app.get('/api/facturacion/estado', (req, res) => {
  res.json({
    success: true,
    configurado: arcaFacturacion.isConfigured(),
    error: arcaFacturacion.isConfigured() ? null : arcaFacturacion.getConfigError(),
    homologacion: !(process.env.ARCA_PRODUCTION === '1' || process.env.ARCA_PRODUCTION === 'true'),
    cuit: arcaFacturacion.CUIT,
    punto_venta: arcaFacturacion.PUNTO_VENTA
  });
});

// Consultar si un pedido/ticket ya tiene una factura emitida (para no
// duplicar comprobantes ni perder el CAE ya obtenido)
app.get('/api/facturacion/by-order/:orderId', async (req, res) => {
  try {
    const factura = await dbFacturacion.findByOrderId(parseInt(req.params.orderId));
    res.json({ success: true, factura: factura || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Emitir Factura C o Tique C para un pedido/ticket existente - Requiere PIN Nivel 2
app.post('/api/facturacion/emitir/:orderId', async (req, res) => {
  try {
    const { tipo, doc_nro, pin } = req.body;

    const auth = verifyUserPin(pin, 2);
    if (!auth.isValid) {
      return res.status(401).json({ success: false, error: 'PIN de Encargado (Nivel 2) o Gerente (Nivel 3) requerido' });
    }

    if (!arcaFacturacion.isConfigured()) {
      return res.status(400).json({ success: false, error: `⚠️ ${arcaFacturacion.getConfigError()}` });
    }

    const tipoNombre = tipo === 'Tique C' ? 'Tique C' : 'Factura C';

    const orderId = parseInt(req.params.orderId);
    const store = db.getStore();
    const order = (store.orders || []).find(o => o.id === orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido/ticket no encontrado.' });
    }

    const yaEmitida = await dbFacturacion.findByOrderId(orderId);
    if (yaEmitida) {
      return res.status(400).json({ success: false, error: `⚠️ Este pedido ya tiene un comprobante emitido: ${yaEmitida.tipo_comprobante_nombre} ${String(yaEmitida.punto_venta).padStart(5, '0')}-${String(yaEmitida.numero_comprobante).padStart(8, '0')} (CAE ${yaEmitida.cae}).`, factura: yaEmitida });
    }

    let resultadoArca;
    try {
      resultadoArca = await arcaFacturacion.emitirComprobante({
        tipoNombre,
        docNro: doc_nro || order.customer_dni || null,
        importeTotal: parseFloat(order.total)
      });
    } catch (arcaErr) {
      return res.status(502).json({ success: false, error: `Error de ARCA al emitir el comprobante: ${arcaErr.message}` });
    }

    const factura = await dbFacturacion.crearFactura({
      order_id: order.id,
      order_number: order.order_number,
      tipo_comprobante_nombre: resultadoArca.tipo_comprobante_nombre,
      tipo_comprobante_id: resultadoArca.tipo_comprobante_id,
      punto_venta: resultadoArca.punto_venta,
      numero_comprobante: resultadoArca.numero_comprobante,
      fecha_emision: resultadoArca.fecha_emision,
      doc_tipo: resultadoArca.doc_tipo,
      doc_nro: resultadoArca.doc_nro,
      cliente_nombre: order.customer_name || '',
      importe_total: resultadoArca.importe_total,
      cae: resultadoArca.cae,
      cae_vencimiento: resultadoArca.cae_vencimiento,
      cuit_emisor: resultadoArca.cuit_emisor,
      condicion_iva_emisor: resultadoArca.condicion_iva_emisor,
      homologacion: resultadoArca.homologacion,
      items: Array.isArray(order.items) ? order.items : [],
      registered_by: `${auth.user.name} (Nivel ${auth.user.level})`
    });

    res.json({ success: true, factura });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Representación imprimible de un comprobante ya emitido (con logo,
// descripción del negocio y el QR obligatorio de ARCA)
app.get('/api/facturacion/print/:id', async (req, res) => {
  try {
    const factura = await dbFacturacion.getById(parseInt(req.params.id));
    if (!factura) {
      return res.status(404).send('Comprobante no encontrado.');
    }
    const settings = getSettingsMap();
    const qrDataUrl = await arcaFacturacion.generarQRDataUrl(factura);
    res.send(renderFacturaHTML(factura, settings, qrDataUrl));
  } catch (err) {
    res.status(500).send(`Error al generar la impresión: ${err.message}`);
  }
});

function renderFacturaHTML(factura, settings, qrDataUrl) {
  const items = Array.isArray(factura.items) ? factura.items
    : (typeof factura.items === 'string' ? JSON.parse(factura.items || '[]') : []);
  const fecha = `${factura.fecha_emision.substring(6, 8)}/${factura.fecha_emision.substring(4, 6)}/${factura.fecha_emision.substring(0, 4)}`;
  const caeVto = factura.cae_vencimiento
    ? `${String(factura.cae_vencimiento).substring(6, 8)}/${String(factura.cae_vencimiento).substring(4, 6)}/${String(factura.cae_vencimiento).substring(0, 4)}`
    : '-';
  const razonSocial = settings.business_razon_social || settings.restaurant_name || 'La Gran Rotisería';
  const logo = settings.business_logo_url
    ? `<img src="${settings.business_logo_url}" alt="Logo" style="max-height:80px;max-width:220px;object-fit:contain;">`
    : '';
  const itemsRows = items.map(it => `
    <tr>
      <td>${(it.qty || it.quantity || 1)}</td>
      <td>${it.name || it.descripcion || ''}</td>
      <td style="text-align:right;">$${Math.round((it.price || it.unit_price || 0) * (it.qty || it.quantity || 1)).toLocaleString('es-AR')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>${factura.tipo_comprobante_nombre} ${String(factura.punto_venta).padStart(5, '0')}-${String(factura.numero_comprobante).padStart(8, '0')}</title>
<style>
  body { font-family: 'Courier New', monospace; max-width: 380px; margin: 20px auto; color: #111; font-size: 13px; }
  .center { text-align: center; }
  .row { display: flex; justify-content: space-between; }
  hr { border: none; border-top: 1px dashed #888; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; border-bottom: 1px solid #333; padding: 3px 0; }
  td { padding: 3px 0; vertical-align: top; }
  .homologacion-banner { background: #fee2e2; color: #991b1b; border: 2px solid #dc2626; padding: 8px; text-align: center; font-weight: bold; margin-bottom: 12px; }
  .qr { text-align: center; margin-top: 14px; }
  @media print { body { margin: 0; } }
</style></head>
<body>
  ${factura.homologacion ? '<div class="homologacion-banner">⚠️ COMPROBANTE DE PRUEBA (HOMOLOGACIÓN) - NO VÁLIDO COMO FACTURA</div>' : ''}
  <div class="center">
    ${logo}
    <h2 style="margin:6px 0 2px;">${razonSocial}</h2>
    ${settings.business_description ? `<div style="font-size:11px;color:#444;">${settings.business_description}</div>` : ''}
    ${settings.business_domicilio_fiscal ? `<div style="font-size:11px;">${settings.business_domicilio_fiscal}</div>` : ''}
    <div style="font-size:11px;">CUIT: ${factura.cuit_emisor} · ${factura.condicion_iva_emisor}</div>
  </div>
  <hr>
  <div class="center">
    <strong>${factura.tipo_comprobante_nombre.toUpperCase()}</strong><br>
    Punto de Venta: ${String(factura.punto_venta).padStart(5, '0')} &nbsp; N°: ${String(factura.numero_comprobante).padStart(8, '0')}<br>
    Fecha: ${fecha}
  </div>
  <hr>
  <div>Cliente: ${factura.cliente_nombre || 'Consumidor Final'}</div>
  ${factura.doc_nro ? `<div>DNI: ${factura.doc_nro}</div>` : ''}
  <hr>
  <table>
    <thead><tr><th>Cant.</th><th>Descripción</th><th style="text-align:right;">Importe</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <hr>
  <div class="row"><strong>TOTAL</strong><strong>$${Math.round(factura.importe_total).toLocaleString('es-AR')}</strong></div>
  <hr>
  <div style="font-size:11px;">CAE: ${factura.cae}</div>
  <div style="font-size:11px;">Vto. CAE: ${caeVto}</div>
  <div class="qr">${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR ARCA" width="150" height="150">` : ''}</div>
  <p class="center" style="font-size:10px;color:#888;margin-top:14px;">Comprobante autorizado electrónicamente por ARCA</p>
</body></html>`;
}

// RUTAS EXPLÍCITAS DE NAVEGACIÓN Y PORTALES (MÁXIMA COMPATIBILIDAD EN CELULARES Y TABLETS)
app.get('/portales', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portales.html')));
app.get('/portales.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portales.html')));

app.get('/produccion', (req, res) => res.sendFile(path.join(__dirname, 'public', 'produccion.html')));
app.get('/produccion.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'produccion.html')));

app.get('/caja', (req, res) => res.sendFile(path.join(__dirname, 'public', 'caja.html')));
app.get('/caja.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'caja.html')));

app.get('/cocina', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cocina.html')));
app.get('/cocina.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cocina.html')));

app.get('/bar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bar.html')));
app.get('/bar.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'bar.html')));

app.get('/manifest-portales.json', (req, res) => {
  res.header('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest-portales.json'));
});
app.get('/manifest-pedidos.json', (req, res) => {
  res.header('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest-pedidos.json'));
});
app.get('/manifest.json', (req, res) => {
  res.header('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest-pedidos.json'));
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const PORT = process.env.PORT || 3000;

// Esperamos a que las bases de datos (la general y la de proveedores, cada
// una por separado) terminen de cargar antes de aceptar pedidos, para no
// arrancar con datos a medio cargar.
Promise.all([db.ready, dbSuppliers.ready, dbSemi.ready, dbFacturacion.ready])
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
🚀 Servidor Delivery, Descarga de Backup ZIP & Auditoría en ejecución:
👉 Local: http://localhost:${PORT}/admin.html
      `);
    });
  })
  .catch((err) => {
    console.error('⚠️ Error al inicializar la base de datos, arrancando de todos modos:', err);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor Delivery arrancado (con errores de base de datos) en el puerto ${PORT}`);
    });
  });
