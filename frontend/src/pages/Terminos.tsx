import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/lib/legal";

export default function Terminos() {
  useEffect(() => {
    document.title = `Condiciones del servicio · ${LEGAL_COMPANY}`;
  }, []);

  return (
    <LegalPage
      kicker="Legal"
      title="Condiciones del servicio"
      intro={`Estas condiciones regulan el uso de ${LEGAL_COMPANY}. Al crear una cuenta o usar la plataforma, aceptas este documento y la Política de privacidad.`}
    >
      <LegalSection title="1. El servicio">
        <p>
          AutoBot es un software SaaS para que concesionarios y vendedores de autos atiendan clientes
          mediante un chatbot en WhatsApp, Facebook e Instagram. El servicio incluye panel de
          conversaciones, inventario, FAQs, financiamiento, promociones, captura de leads y respuestas
          automáticas con IA, según las funciones habilitadas en tu cuenta.
        </p>
      </LegalSection>

      <LegalSection title="2. Cuenta y elegibilidad">
        <p>
          Debes ser mayor de edad y usar la plataforma en nombre de un negocio automotriz. Eres
          responsable de la veracidad de tus datos, de proteger tu contraseña y de la actividad que ocurra
          en tu cuenta.
        </p>
      </LegalSection>

      <LegalSection title="3. WhatsApp y Meta">
        <p>
          Tú conectas tu propio número de WhatsApp Business y, en su caso, tus páginas de Facebook o
          Instagram. Debes cumplir las políticas de WhatsApp/Meta, incluyendo consentimiento de los
          destinatarios y uso aceptable. AutoBot no es Meta y no garantiza que Meta apruebe un número, una
          plantilla o un volumen de envío.
        </p>
        <p>
          Queda prohibido usar la plataforma para spam, phishing, acoso o cualquier fin ilegal. Podemos
          suspender cuentas que pongan en riesgo a clientes, a otros usuarios o a la integración con Meta.
        </p>
      </LegalSection>

      <LegalSection title="4. Contenido y datos que subes">
        <p>
          Conservas la titularidad de tu inventario, FAQs, mensajes y configuración. Nos otorgas una
          licencia limitada para tratarlos solo con el fin de prestar el servicio. Garantizas que tienes
          base legal para contactar a los leads (interés comercial, consentimiento u otra base aplicable).
        </p>
      </LegalSection>

      <LegalSection title="5. Disponibilidad e IA">
        <p>
          El asistente interpreta mensajes y puede equivocarse. Debes revisar conversaciones críticas y
          leads. El servicio puede interrumpirse por mantenimiento o por fallas de WhatsApp, Meta, OpenAI o
          el hosting. No prometemos disponibilidad ininterrumpida.
        </p>
      </LegalSection>

      <LegalSection title="6. Limitación de responsabilidad">
        <p>
          En la medida permitida por la ley mexicana, AutoBot no responde por daños indirectos, lucro
          cesante o decisiones tomadas con base en una interpretación automática de un mensaje. Nuestra
          responsabilidad total, si la hubiera, no excederá lo pagado por el servicio en los tres meses
          anteriores al reclamo.
        </p>
      </LegalSection>

      <LegalSection title="7. Terminación">
        <p>
          Puedes dejar de usar el servicio y solicitar la eliminación de tus datos según las{" "}
          <Link to="/eliminar-datos" className="text-foreground underline underline-offset-4">
            instrucciones de eliminación
          </Link>
          . También puedes eliminar la cuenta desde Perfil. Podemos cerrar o restringir cuentas por abuso o
          incumplimiento de estas condiciones.
        </p>
      </LegalSection>

      <LegalSection title="8. Contacto y ley aplicable">
        <p>
          Contacto:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Estas condiciones se interpretan conforme a las leyes de los Estados Unidos Mexicanos. Ver
          también la{" "}
          <Link to="/privacidad" className="text-foreground underline underline-offset-4">
            Política de privacidad
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
