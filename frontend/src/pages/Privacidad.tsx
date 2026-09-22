import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/lib/legal";

export default function Privacidad() {
  useEffect(() => {
    document.title = `Política de privacidad · ${LEGAL_COMPANY}`;
  }, []);

  return (
    <LegalPage
      kicker="Legal"
      title="Política de privacidad"
      intro={`${LEGAL_COMPANY} opera una plataforma SaaS de chatbot para concesionarios y vendedores de autos en WhatsApp, Facebook e Instagram. Esta política explica qué datos tratamos, para qué y cómo puedes ejercer tus derechos.`}
    >
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          El responsable es {LEGAL_COMPANY}. Para cualquier solicitud de privacidad, acceso, corrección o
          eliminación escribe a{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Qué datos recopilamos">
        <p>Según el uso de la plataforma, podemos tratar:</p>
        <p>
          <strong className="text-foreground">Cuenta del concesionario:</strong> nombre, correo, contraseña
          (almacenada como hash), teléfono, perfil del negocio (razón social, RFC, dirección, logotipo) y
          preferencias de notificaciones.
        </p>
        <p>
          <strong className="text-foreground">Inventario y operación:</strong> vehículos, FAQs, planes de
          financiamiento, promociones, configuración del bot y calendario de citas.
        </p>
        <p>
          <strong className="text-foreground">Leads y conversaciones:</strong> nombre, teléfono u otros
          identificadores del cliente, mensajes, intención de compra y datos que el lead comparte en el chat.
        </p>
        <p>
          <strong className="text-foreground">WhatsApp y Meta:</strong> número conectado, identificadores
          técnicos (WABA, phone number id, page id), tokens de acceso, mensajes enviados y recibidos, y
          estados de entrega. El contenido se usa para que el asistente de IA atienda a los clientes del
          negocio.
        </p>
        <p>
          <strong className="text-foreground">Uso del sitio:</strong> registros técnicos (IP, fecha, errores)
          y, si está activo, analítica.
        </p>
      </LegalSection>

      <LegalSection title="3. Para qué usamos los datos">
        <p>
          Prestamos el servicio de chatbot de ventas: recibir y responder mensajes, mostrar inventario,
          capturar leads, escalar a un asesor humano y operar el panel. También usamos los datos para
          soporte, seguridad, prevención de abuso y obligaciones legales.
        </p>
        <p>
          No vendemos listas de clientes ni usamos conversaciones de WhatsApp o Messenger para anuncios a
          terceros.
        </p>
      </LegalSection>

      <LegalSection title="4. WhatsApp, Meta y otros encargados">
        <p>
          Si conectas WhatsApp Business mediante la API oficial de Meta (Embedded Signup / Cloud API), Meta
          Platforms, Inc. trata mensajes y números según sus políticas de WhatsApp Business Platform. Lo
          mismo aplica a Facebook e Instagram Messaging cuando conectas esas páginas.
        </p>
        <p>
          Otros encargados habituales: OpenAI (interpretación y generación de respuestas) y el proveedor de
          hosting/base de datos. Cada uno trata solo lo necesario para su función.
        </p>
      </LegalSection>

      <LegalSection title="5. Conservación">
        <p>
          Conservamos la cuenta, el inventario y las conversaciones mientras el servicio esté activo y el
          tiempo adicional necesario para soporte o requisitos legales. Si pides la eliminación, aplicamos
          el proceso descrito en{" "}
          <Link to="/eliminar-datos" className="text-foreground underline underline-offset-4">
            Eliminación de datos
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Tus derechos">
        <p>
          Puedes solicitar acceso, rectificación, cancelación, oposición o limitación del tratamiento, y la
          portabilidad de tus datos, conforme a la legislación mexicana aplicable (incluida la LFPDPPP en lo
          que corresponda). Escríbenos a {LEGAL_CONTACT_EMAIL}.
        </p>
        <p>
          Los clientes que escriban al negocio por WhatsApp o Facebook pueden pedir que dejemos de
          contactarlos o que borremos sus datos; el concesionario o nosotros atenderemos esa solicitud.
        </p>
      </LegalSection>

      <LegalSection title="7. Seguridad y menores">
        <p>
          Ciframos credenciales de WhatsApp/Meta en el servidor y no exponemos tokens ni secretos de Meta en
          el navegador. Ningún sistema es infalible; si detectamos un incidente relevante, lo atenderemos y
          notificaremos cuando la ley lo requiera.
        </p>
        <p>El servicio está dirigido a negocios (concesionarios y vendedores), no a menores de 18 años.</p>
      </LegalSection>

      <LegalSection title="8. Cambios">
        <p>
          Si actualizamos esta política, publicaremos la nueva fecha en esta página. El uso continuado del
          servicio después del cambio implica que conoces la versión vigente.
        </p>
        <p>
          Consulta también las{" "}
          <Link to="/terminos" className="text-foreground underline underline-offset-4">
            Condiciones del servicio
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
