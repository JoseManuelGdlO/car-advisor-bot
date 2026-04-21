// Mock data for the AutoBot chatbot manager demo

export type Channel = "whatsapp" | "facebook";
export type ClientStatus = "lead" | "negotiation" | "sold" | "lost";
export type CarStatus = "available" | "reserved" | "sold";

export interface Car {
  id: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  km: number;
  transmission: "Manual" | "Automática";
  engine: string;
  color: string;
  status: CarStatus;
  description: string;
  image: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  channel: Channel;
  status: ClientStatus;
  interestedIn: string;
  lastMessage: string;
  lastMessageAt: string;
  notes: string;
  avatarColor: string;
}

export interface Message {
  id: string;
  from: "client" | "bot" | "seller";
  text: string;
  time: string;
}

export interface Conversation {
  id: string;
  clientId: string;
  channel: Channel;
  unread: number;
  lastMessage: string;
  lastTime: string;
  messages: Message[];
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface Promo {
  id: string;
  title: string;
  description: string;
  validUntil: string;
  active: boolean;
  appliesTo: string;
}

// Color palette for avatars (using HSL semantic-friendly values)
const avatarColors = [
  "hsl(142 70% 49%)",
  "hsl(210 90% 55%)",
  "hsl(38 92% 50%)",
  "hsl(280 65% 60%)",
  "hsl(0 75% 60%)",
  "hsl(162 75% 35%)",
];

export const cars: Car[] = [
  {
    id: "c1", brand: "Toyota", model: "Corolla", year: 2020, price: 285000, km: 48000,
    transmission: "Automática", engine: "1.8L", color: "Blanco perla", status: "available",
    description: "Único dueño, servicios de agencia, llantas nuevas.",
    image: "🚗",
  },
  {
    id: "c2", brand: "Mazda", model: "Mazda 3", year: 2022, price: 365000, km: 22000,
    transmission: "Automática", engine: "2.0L Skyactiv", color: "Rojo soul", status: "available",
    description: "Como nuevo, garantía de fábrica vigente, paquete i-Touring.",
    image: "🚙",
  },
  {
    id: "c3", brand: "Nissan", model: "Versa", year: 2021, price: 235000, km: 35000,
    transmission: "Manual", engine: "1.6L", color: "Gris plata", status: "reserved",
    description: "Económico, perfecto para ciudad. Aire, pantalla, cámara.",
    image: "🚘",
  },
  {
    id: "c4", brand: "Chevrolet", model: "Aveo", year: 2019, price: 165000, km: 62000,
    transmission: "Manual", engine: "1.5L", color: "Azul cobalto", status: "available",
    description: "Auto rendidor, ideal primer auto. Listo para estrenar.",
    image: "🚖",
  },
  {
    id: "c5", brand: "Honda", model: "Civic", year: 2023, price: 485000, km: 8500,
    transmission: "Automática", engine: "2.0L i-VTEC", color: "Negro cristal", status: "available",
    description: "Versión Touring, quemacocos, asientos de piel, sensores.",
    image: "🏎️",
  },
  {
    id: "c6", brand: "Volkswagen", model: "Jetta", year: 2020, price: 295000, km: 41000,
    transmission: "Automática", engine: "1.4L TSI", color: "Plata reflex", status: "sold",
    description: "Versión Comfortline, factura original.",
    image: "🚗",
  },
  {
    id: "c7", brand: "Kia", model: "Rio", year: 2022, price: 268000, km: 18000,
    transmission: "Automática", engine: "1.6L", color: "Rojo signal", status: "available",
    description: "Modelo nuevo, pantalla CarPlay, cámara reversa, garantía.",
    image: "🚙",
  },
  {
    id: "c8", brand: "Hyundai", model: "Accent", year: 2021, price: 245000, km: 29000,
    transmission: "Manual", engine: "1.6L", color: "Blanco polar", status: "available",
    description: "Bien cuidado, factura agencia, único dueño.",
    image: "🚘",
  },
];

export const clients: Client[] = [
  { id: "u1", name: "Carlos Mendoza", phone: "+52 55 1234 5678", channel: "whatsapp", status: "negotiation",
    interestedIn: "Mazda 3 2022", lastMessage: "¿Aceptan mi Versa a cuenta?", lastMessageAt: "10:42",
    notes: "Quiere financiar 36 meses. Tiene un Versa 2018 para entregar a cuenta.", avatarColor: avatarColors[0] },
  { id: "u2", name: "María Fernández", phone: "+52 55 2345 6789", channel: "facebook", status: "lead",
    interestedIn: "Honda Civic 2023", lastMessage: "Hola, ¿sigue disponible?", lastMessageAt: "10:15",
    notes: "", avatarColor: avatarColors[1] },
  { id: "u3", name: "José Luis Ramírez", phone: "+52 55 3456 7890", channel: "whatsapp", status: "sold",
    interestedIn: "VW Jetta 2020", lastMessage: "¡Gracias! Ya estoy estrenando 🎉", lastMessageAt: "ayer",
    notes: "Cerrado el 12 de abril. Pagó de contado.", avatarColor: avatarColors[5] },
  { id: "u4", name: "Andrea Soto", phone: "+52 55 4567 8901", channel: "whatsapp", status: "negotiation",
    interestedIn: "Toyota Corolla 2020", lastMessage: "¿Cuánto sería el enganche mínimo?", lastMessageAt: "09:58",
    notes: "Trabaja en gobierno, quiere crédito FOVISSSTE.", avatarColor: avatarColors[2] },
  { id: "u5", name: "Luis Hernández", phone: "+52 55 5678 9012", channel: "facebook", status: "lead",
    interestedIn: "Kia Rio 2022", lastMessage: "Mando datos para apartar", lastMessageAt: "09:30",
    notes: "", avatarColor: avatarColors[3] },
  { id: "u6", name: "Patricia Núñez", phone: "+52 55 6789 0123", channel: "whatsapp", status: "lost",
    interestedIn: "Chevrolet Aveo 2019", lastMessage: "Lo encontré más barato en otro lado", lastMessageAt: "lun",
    notes: "Comparó precios, no avanzó.", avatarColor: avatarColors[4] },
  { id: "u7", name: "Roberto Cano", phone: "+52 55 7890 1234", channel: "whatsapp", status: "lead",
    interestedIn: "Nissan Versa 2021", lastMessage: "¿Hay prueba de manejo?", lastMessageAt: "08:45",
    notes: "", avatarColor: avatarColors[0] },
  { id: "u8", name: "Sofía Aguilar", phone: "+52 55 8901 2345", channel: "facebook", status: "negotiation",
    interestedIn: "Hyundai Accent 2021", lastMessage: "Mañana voy a verlo", lastMessageAt: "ayer",
    notes: "Cita confirmada miércoles 4pm.", avatarColor: avatarColors[1] },
  { id: "u9", name: "Diego Vargas", phone: "+52 55 9012 3456", channel: "whatsapp", status: "lead",
    interestedIn: "Honda Civic 2023", lastMessage: "¿Tienen otro color?", lastMessageAt: "ayer",
    notes: "", avatarColor: avatarColors[5] },
  { id: "u10", name: "Lucía Ortega", phone: "+52 55 0123 4567", channel: "whatsapp", status: "lead",
    interestedIn: "Toyota Corolla 2020", lastMessage: "Enviame fotos por favor", lastMessageAt: "mar",
    notes: "", avatarColor: avatarColors[2] },
  { id: "u11", name: "Ernesto Pacheco", phone: "+52 55 1122 3344", channel: "facebook", status: "negotiation",
    interestedIn: "Mazda 3 2022", lastMessage: "Acepto la oferta, ¿cuándo firmo?", lastMessageAt: "10:50",
    notes: "Listo para cerrar esta semana.", avatarColor: avatarColors[3] },
  { id: "u12", name: "Gabriela Ríos", phone: "+52 55 5566 7788", channel: "whatsapp", status: "sold",
    interestedIn: "Kia Rio 2022", lastMessage: "Todo perfecto, gracias 🙌", lastMessageAt: "vie",
    notes: "Vendido el 10 de abril.", avatarColor: avatarColors[4] },
];

export const conversations: Conversation[] = [
  {
    id: "conv1", clientId: "u1", channel: "whatsapp", unread: 2,
    lastMessage: "¿Aceptan mi Versa a cuenta?", lastTime: "10:42",
    messages: [
      { id: "m1", from: "client", text: "Hola, vi su anuncio del Mazda 3 2022", time: "10:30" },
      { id: "m2", from: "bot", text: "¡Hola Carlos! 👋 Sí, el Mazda 3 2022 sigue disponible. Precio $365,000. ¿Te gustaría agendar una prueba de manejo?", time: "10:30" },
      { id: "m3", from: "client", text: "¿Cuánto de enganche piden?", time: "10:35" },
      { id: "m4", from: "bot", text: "Manejamos enganche desde el 20% ($73,000) con financiamiento a 12, 24, 36 o 48 meses. ¿Quieres una cotización personalizada?", time: "10:35" },
      { id: "m5", from: "client", text: "¿Aceptan mi Versa a cuenta?", time: "10:42" },
    ],
  },
  {
    id: "conv2", clientId: "u2", channel: "facebook", unread: 1,
    lastMessage: "Hola, ¿sigue disponible?", lastTime: "10:15",
    messages: [
      { id: "m1", from: "client", text: "Hola, ¿sigue disponible?", time: "10:15" },
    ],
  },
  {
    id: "conv3", clientId: "u4", channel: "whatsapp", unread: 0,
    lastMessage: "¿Cuánto sería el enganche mínimo?", lastTime: "09:58",
    messages: [
      { id: "m1", from: "client", text: "Buen día, me interesa el Corolla", time: "09:50" },
      { id: "m2", from: "bot", text: "¡Hola Andrea! El Toyota Corolla 2020 está en $285,000. Único dueño, servicios de agencia. ¿Lo quieres ver?", time: "09:50" },
      { id: "m3", from: "client", text: "¿Cuánto sería el enganche mínimo?", time: "09:58" },
    ],
  },
  {
    id: "conv4", clientId: "u11", channel: "facebook", unread: 3,
    lastMessage: "Acepto la oferta, ¿cuándo firmo?", lastTime: "10:50",
    messages: [
      { id: "m1", from: "seller", text: "Le hago una rebaja a $355,000 por pago de contado", time: "10:45" },
      { id: "m2", from: "client", text: "Acepto la oferta, ¿cuándo firmo?", time: "10:50" },
    ],
  },
  {
    id: "conv5", clientId: "u7", channel: "whatsapp", unread: 0,
    lastMessage: "¿Hay prueba de manejo?", lastTime: "08:45",
    messages: [
      { id: "m1", from: "client", text: "¿Hay prueba de manejo?", time: "08:45" },
      { id: "m2", from: "bot", text: "¡Claro! Las pruebas de manejo son sin costo. ¿Qué día te queda bien?", time: "08:45" },
    ],
  },
  {
    id: "conv6", clientId: "u5", channel: "facebook", unread: 1,
    lastMessage: "Mando datos para apartar", lastTime: "09:30",
    messages: [
      { id: "m1", from: "client", text: "Me interesa el Kia Rio", time: "09:25" },
      { id: "m2", from: "bot", text: "¡Buena elección Luis! El Kia Rio 2022 está en $268,000. ¿Te interesa apartarlo? El apartado es de $5,000 reembolsables.", time: "09:25" },
      { id: "m3", from: "client", text: "Mando datos para apartar", time: "09:30" },
    ],
  },
];

export const faqs: Faq[] = [
  { id: "f1", question: "¿Aceptan auto a cuenta?",
    answer: "¡Sí! Recibimos tu auto a cuenta. Mándanos marca, modelo, año y kilometraje para darte una valuación." },
  { id: "f2", question: "¿Tienen financiamiento?",
    answer: "Trabajamos con varios bancos. Plazos de 12 a 60 meses, enganche desde 20%. Aprobación en 24h." },
  { id: "f3", question: "¿Puedo apartar el auto?",
    answer: "Sí, con $5,000 reembolsables apartas tu auto hasta por 5 días mientras completas el trámite." },
  { id: "f4", question: "¿Hacen pruebas de manejo?",
    answer: "Por supuesto, sin costo. Solo necesitas tu licencia vigente. Agendamos por WhatsApp." },
  { id: "f5", question: "¿Tienen garantía?",
    answer: "Todos los autos seminuevos llevan 3 meses de garantía mecánica. Los nuevos con garantía de fábrica." },
  { id: "f6", question: "¿Dónde están ubicados?",
    answer: "Av. Insurgentes Sur 1234, Col. Del Valle, CDMX. Lunes a sábado 9am-7pm." },
  { id: "f7", question: "¿Aceptan tarjeta de crédito?",
    answer: "Aceptamos tarjeta hasta por $50,000 sin comisión. El resto por transferencia o cheque." },
  { id: "f8", question: "¿Los autos tienen factura original?",
    answer: "Sí, todos nuestros autos cuentan con factura original y verificación al corriente." },
];

export const promos: Promo[] = [
  { id: "p1", title: "Enganche desde $20,000",
    description: "Llévate tu auto seminuevo con solo $20,000 de enganche. Mensualidades a tu medida.",
    validUntil: "30 abr 2026", active: true, appliesTo: "Seminuevos seleccionados" },
  { id: "p2", title: "Mensualidades sin intereses 12 meses",
    description: "Solo este mes: financia tu auto a 12 meses sin intereses con bancos participantes.",
    validUntil: "30 abr 2026", active: true, appliesTo: "Toda la flotilla" },
  { id: "p3", title: "Estrena en abril 🚗",
    description: "Te regalamos la verificación, tenencia y placas al comprar este mes.",
    validUntil: "30 abr 2026", active: true, appliesTo: "Autos 2022 en adelante" },
];

export const kpis = {
  activeChats: 14,
  newToday: 6,
  waiting: 3,
  newLeads: 28,
  newLeadsChange: 12,
  conversions: 4,
  conversionsChange: 33,
  weeklyChats: [12, 18, 15, 22, 19, 25, 21],
  topProducts: [
    { name: "Honda Civic 2023", queries: 42 },
    { name: "Mazda 3 2022", queries: 36 },
    { name: "Toyota Corolla 2020", queries: 29 },
    { name: "Kia Rio 2022", queries: 21 },
    { name: "Nissan Versa 2021", queries: 18 },
  ],
};
