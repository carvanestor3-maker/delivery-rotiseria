# ☁️ Guía Paso a Paso para Desplegar el Sistema 100% en la Nube

Con esta guía subirás el sistema a la nube gratuitamente en **Render.com** para que funcione las 24hs **sin depender de ninguna computadora encendida en el local**.

---

## 📌 Paso 1: Subir el proyecto a GitHub (Privado)

1. Abre la página [github.com/new](https://github.com/new) e inicia sesión (o crea una cuenta gratis si no la tienes).
2. Nombra tu repositorio (ejemplo: `delivery-rotiseria`).
3. Elige la opción **Private (Privado)** para proteger tu código.
4. Presiona **Create repository**.
5. En la carpeta de tu computadora `c:\Users\niico\canales youtube\delivery-app`, abre una consola/terminal y ejecuta:

```bash
git init
git add .
git commit -m "Inicializar Delivery App Nube"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/delivery-rotiseria.git
git push -u origin main
```

*(Reemplaza `TU_USUARIO` y `delivery-rotiseria` por los datos de tu cuenta de GitHub).*

---

## ☁️ Paso 2: Crear el Servidor en Render.com (Gratis)

1. Entra a [dashboard.render.com](https://dashboard.render.com) e inicia sesión con tu cuenta de GitHub.
2. Presiona el botón azul **New +** y selecciona **Web Service**.
3. En la lista, selecciona tu repositorio privado `delivery-rotiseria` y haz click en **Connect**.
4. Configura los siguientes campos:
   - **Name**: `rotiseria-delivery` *(o el nombre de tu local)*
   - **Region**: Oregon (US West) o la más cercana.
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Presiona el botón **Create Web Service**.

---

## 🎉 ¡Listo! Enlaces Nube 100% Operativos

En 2 minutos Render compilará tu aplicación y te dará tu enlace permanente `https://rotiseria-delivery.onrender.com`.

### 📲 Cómo lo usarán en el Local y Remoto:

1. **Cocina (Celular 1)**: Abre `https://rotiseria-delivery.onrender.com/cocina.html`
2. **Caja (Celular 2)**: Abre `https://rotiseria-delivery.onrender.com/caja.html`
3. **Menú de Clientes**: `https://rotiseria-delivery.onrender.com/` (Compartir enlace o QR en WhatsApp).
4. **Dueño (Administración Remota)**: Abre `https://rotiseria-delivery.onrender.com/admin.html` desde tu celular en cualquier lugar.
