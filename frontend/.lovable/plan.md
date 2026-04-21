

# Maqueta visual — Chatbot Manager para vendedores de autos

**Nota importante:** Lovable construye web apps (React + Vite), no React Native. Esta maqueta será una **web app responsive con vista de celular** que servirá como referencia visual exacta (pantallas, componentes, flujos, colores, tipografía) para que la portes a React Native. Cada pantalla estará pensada con dimensiones y layout móvil.

## Estilo visual
- Paleta WhatsApp-friendly: verde brillante (#25D366 / #128C7E) como primario, fondos claros, acentos en verde oscuro.
- Tipografía limpia (Inter), íconos tipo Lucide/Feather.
- Componentes con bordes redondeados generosos, sombras suaves, look familiar para vendedores que vienen de WhatsApp.
- Frame de celular en desktop para visualizar como app móvil.

## Pantallas (5 secciones + sub-pantallas de configuración)

### 1. Login
- Logo arriba, campo email/teléfono, contraseña, botón "Entrar" verde.
- Link "¿Olvidaste tu contraseña?" y "Crear cuenta".
- Opción "Continuar con Google" y "Continuar con Facebook" (visual, sin auth real).

### 2. Dashboard (KPIs)
Cards con métricas clave:
- **Conversaciones activas hoy** (con indicador de nuevas vs. en espera)
- **Leads nuevos** y **conversiones** (con % de cambio vs. ayer)
- **Top productos consultados** (lista de los 5 autos más preguntados)
- Gráfico simple de conversaciones por día (últimos 7 días)
- Acceso rápido a "Conversaciones pendientes"

### 3. Clientes
- Lista de clientes con avatar, nombre, último mensaje, etiqueta (Lead nuevo / En negociación / Vendido / Perdido).
- Buscador y filtros por estado.
- Detalle del cliente: datos de contacto, auto que le interesa, historial de conversación, notas del vendedor.

### 4. Conversaciones
- Lista tipo WhatsApp: avatar, nombre, preview del último mensaje, hora, badge de no leídos.
- Filtro por canal (WhatsApp / Facebook) con íconos.
- Vista de chat individual: burbujas de mensajes, distinción entre respuestas del bot y del vendedor, input para tomar control manual de la conversación.

### 5. Configuración del Chatbot
Pantalla principal con 3 tarjetas que llevan a sub-pantallas:

**5a. Preguntas Frecuentes**
- Lista de FAQs con pregunta + respuesta del bot.
- Botón "+ Agregar pregunta", editar/eliminar.
- Datos demo: "¿Aceptan auto a cuenta?", "¿Tienen financiamiento?", "¿Puedo apartar?", "¿Hacen pruebas de manejo?".

**5b. Productos (Autos)**
- Galería tipo grid con foto, marca, modelo, año, precio, estado (Disponible / Apartado / Vendido).
- Detalle del auto: especificaciones (km, transmisión, motor, color), fotos múltiples, descripción.
- Botón "+ Agregar auto".
- Datos demo: Toyota Corolla 2020, Mazda 3 2022, Nissan Versa 2021, Chevrolet Aveo 2019, Honda Civic 2023, etc.

**5c. Promociones**
- Cards de promociones activas: título, descripción, vigencia, autos aplicables.
- Toggle activar/desactivar.
- Datos demo: "Enganche desde $20,000", "Mensualidades sin intereses 12 meses", "Estrena en julio".

## Navegación
- Bottom tab bar con 5 íconos (Dashboard, Clientes, Chats, Config, Perfil) — patrón mobile estándar fácil de portar a React Navigation.
- Header con título de sección y acción contextual.

## Datos demo realistas
Toda la maqueta vendrá con datos mock de un concesionario: ~8 autos, ~12 clientes, ~6 conversaciones de ejemplo (preguntas reales tipo "¿sigue disponible el Mazda?", "¿cuánto de enganche?"), ~8 FAQs y 3 promociones activas.

## Para portar a React Native
La estructura de componentes, nombres de pantallas, props y estilos serán claros y replicables. Los íconos (Lucide) tienen equivalente en `lucide-react-native`. La paleta y tipografía se traducen 1:1 a StyleSheet de RN.

