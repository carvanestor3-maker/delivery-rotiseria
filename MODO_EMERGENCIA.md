# 🆘 Modo Emergencia: PC como servidor de última instancia

Esta guía es para el día que **se corte el internet en el local** y el sistema
de la nube (`delivery-rotiseria.onrender.com` / `spressgastro-ar.com`) no sea
accesible. Esta misma PC puede seguir tomando pedidos por WiFi local, sin
depender de internet.

## 1. Cómo activarlo

1. Anda a la carpeta del sistema (`delivery-app`).
2. Hace doble click en **`iniciar_servidor_local.bat`**.
3. Se abre una ventana negra (consola) que te muestra tu dirección IP local,
   algo como `192.168.0.15`, y después arranca el servidor.
4. Dejá esa ventana abierta mientras dure el corte de internet — si la
   cerrás, el sistema se apaga.

## 2. Cómo se conectan los celulares/tablets

**Importante: todos los dispositivos (cocina, caja, mostrador) tienen que
estar conectados al mismo WiFi que esta PC.** El router sigue funcionando
sin internet, solo no hay salida afuera — pero la red local interna sigue
andando perfecto.

En cada celular, en vez de entrar a la web de siempre, escriben en el
navegador (reemplazando por la IP que te mostró la ventana):

- Cocina: `http://192.168.0.15:3000/cocina.html`
- Caja: `http://192.168.0.15:3000/caja.html`
- Admin: `http://192.168.0.15:3000/admin.html`
- Menú clientes: `http://192.168.0.15:3000/`

Tip: podés guardarlos como acceso directo / favorito en cada celular con la
IP puesta, así el día del corte solo tienen que abrirlo (puede que la IP
cambie de vez en cuando, en ese caso hay que actualizar el acceso directo).

## 3. Qué pasa con los datos (esto es lo importante)

Mientras estás en este modo, los pedidos se guardan en un archivo en esta
misma PC (`delivery_store.json`), **separado de la base de datos de la
nube (Postgres)**. Es decir:

- Los pedidos que tomes durante el corte **no aparecen solos** en el
  sistema de la nube.
- Cuando vuelva el internet, lo que hagas en el sistema de la nube va a
  arrancar desde donde había quedado antes del corte (sin los pedidos que
  tomaste localmente).

**Recomendación:** usá el modo emergencia solo para no perder ventas
mientras no hay internet. Si necesitás tener todo centralizado (por
ejemplo para hacer caja o estadísticas), anotá esos pedidos aparte y
cargalos a mano en el sistema de la nube una vez que vuelva la conexión.

## 4. Cómo volver a la normalidad

1. Cuando vuelva el internet, cerrá la ventana del servidor local
   (o apretá Ctrl+C adentro de la consola).
2. Avisá al personal que vuelvan a usar el link de siempre:
   `https://delivery-rotiseria.onrender.com` (o `spressgastro-ar.com`).
3. Si tomaste pedidos importantes durante el corte, cargalos a mano en el
   sistema de la nube.

---

*Esta guía se generó junto con la migración a Postgres (14/09/2026). El
sistema en la nube ya no depende de que esta PC esté prendida — esta PC
solo se usa como respaldo para el caso puntual de que se corte internet en
el local.*
