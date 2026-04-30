# WhatsApp Connect V2 - Integracion E2E

## Objetivo
Habilitar el canal `whatsapp` con proveedor `whatsapp-connect` 

# Manual de usuario: conectar un device nuevo

Esta guia describe el proceso completo para una persona vendedora que quiere conectar su WhatsApp por primera vez en la plataforma.

### Antes de empezar (requisitos)
- Tener una cuenta creada y acceso al panel.
- Tener una integracion de tipo `whatsapp-connect` en estado utilizable (`draft` o `active`).
- Contar con los datos de WhatsApp Connect:
  - `deviceId`
  - `webhookSecret`
  - `tenantId` (si aplica en tu proveedor)
- Tener el telefono disponible para escanear QR desde WhatsApp.

### Paso 1. Crear cuenta e iniciar sesion
1. Entra al sistema y crea tu cuenta (si aun no existe).
2. Inicia sesion con tu correo y password.
3. Verifica que puedas entrar al modulo de perfil/integraciones.

Resultado esperado:
- La cuenta queda autenticada y puedes ver la seccion `Integraciones`.

### Paso 2. Crear la integracion de WhatsApp
1. Ve a `Perfil` -> `Integraciones`.
2. Haz clic en `Canal`.
3. Crea una integracion con:
   - Canal: `WhatsApp`
   - Proveedor: `whatsapp-connect`
   - Nombre visible: el que prefieras (ej. `WhatsApp Ventas Sucursal Centro`)
4. Guarda.

Resultado esperado:
- Aparece una tarjeta de WhatsApp en la lista de integraciones.

### Paso 3. Guardar credenciales del proveedor
1. En la tarjeta de WhatsApp, presiona `Credenciales`.
2. Captura y guarda:
   - `deviceId` (obligatorio)
   - `webhookSecret` (obligatorio)
   - `tenantId` (opcional, solo si tu entorno lo requiere)
3. Guarda cambios.

Resultado esperado:
- La UI muestra credenciales activas/validas.
- La integracion debe quedar en estado `active` o lista para activar.

### Paso 4. Activar la integracion
1. Presiona `Activar` en la tarjeta de WhatsApp (si aplica en tu flujo).
2. Verifica que el estado del canal no quede en `error`.

Resultado esperado:
- La integracion queda activa para procesar mensajes.

### Paso 5. Generar el QR de vinculacion
1. Presiona `Generar QR`.
2. Se abrira o mostrara un link publico temporal para el QR.
3. Con tu telefono, abre WhatsApp y escanea el QR.

Resultado esperado:
- WhatsApp queda vinculado al device configurado.

Si falla en este paso:
- Error `WhatsApp Connect resource not found` normalmente indica que el `deviceId` no existe en el proveedor o no corresponde al entorno configurado.
- Revisa `deviceId`, `WC_API_URL` y permisos del `WC_SERVICE_JWT`.

### Paso 6. Verificar estado del device
1. Presiona `Estado device`.
2. Revisa el estado reportado.

Interpretacion:
- `ONLINE`: listo para operar.
- `OFFLINE`: no esta conectado, repite vinculacion QR.
- `UNKNOWN`: proveedor no confirma estado, revisar configuracion.

Resultado esperado:
- El estado debe ser `ONLINE` antes de pruebas productivas.

### Paso 7. Probar envio saliente
1. Presiona `Probar envio`.
2. Ingresa un numero destino de prueba y un mensaje corto.
3. Envia.

Resultado esperado:
- El destinatario recibe el mensaje.
- En backend, la respuesta esperada es aceptacion (`202`) o envio correcto segun flujo.

### Paso 8. Validar flujo real inbound -> bot -> outbound
1. Desde un numero externo, envia un mensaje al WhatsApp conectado.
2. Confirma que:
   - El mensaje entra al CRM.
   - El bot responde automaticamente (si `shouldAutoReply=true`).
   - La respuesta se entrega por WhatsApp Connect.

Resultado esperado:
- Conversacion completa funcionando de punta a punta.

### Checklist rapido de verificacion final
- Integracion creada con `channel=whatsapp` y `provider=whatsapp-connect`.
- Credenciales guardadas con `deviceId` y `webhookSecret` correctos.
- Integracion en estado `active`.
- Device en estado `ONLINE`.
- Envio de prueba exitoso.
- Flujo real inbound/outbound validado.

### Solucion de problemas (errores comunes)
- `401` en webhook o llamadas al proveedor:
  - `webhookSecret` incorrecto, firma invalida o JWT invalido.
- `403`:
  - token sin permisos suficientes en WhatsApp Connect.
- `404` al generar QR o consultar estado:
  - `deviceId` no existe en el proveedor o `WC_API_URL` apunta al entorno equivocado.
- `429`:
  - limite de proveedor; reintentar despues de unos segundos.
- `502/504`:
  - problema temporal de red/upstream; reintentar y revisar conectividad.
