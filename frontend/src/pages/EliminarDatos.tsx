import { useEffect } from "react";
import { Link } from "react-router-dom";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_COMPANY, LEGAL_CONTACT_EMAIL, LEGAL_DELETION_MAILTO } from "@/lib/legal";

export default function EliminarDatos() {
  useEffect(() => {
    document.title = `Eliminación de datos de usuario · ${LEGAL_COMPANY}`;
  }, []);

  return (
    <LegalPage
      kicker="Legal"
      title="Eliminación de datos de usuario"
      intro="Esta página cumple el requisito de Meta de publicar instrucciones claras para borrar los datos que AutoBot trata cuando usas Facebook Login, WhatsApp Business o nuestra plataforma."
    >
      <LegalSection title="1. Quién puede pedir el borrado">
        <p>
          <strong className="text-foreground">Concesionario o titular de la cuenta:</strong> puedes pedir
          que eliminemos tu usuario, inventario, conversaciones, leads y la conexión de WhatsApp, Facebook
          o Instagram.
        </p>
        <p>
          <strong className="text-foreground">Cliente o destinatario de WhatsApp:</strong> puedes pedir que
          borremos tu número, nombre y mensajes asociados a un concesionario. También puedes escribir al
          negocio que te contactó.
        </p>
      </LegalSection>

      <LegalSection title="2. Cómo solicitarlo">
        <p>Envía un correo a:</p>
        <p>
          <a href={LEGAL_DELETION_MAILTO} className="text-foreground underline underline-offset-4">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
        <p>Incluye, en la medida de lo posible:</p>
        <p>
          1. Asunto: “Solicitud de eliminación de datos”.
          <br />
          2. El correo con el que te registraste en AutoBot, o el número de WhatsApp que recibió mensajes.
          <br />
          3. Si eres cliente, el nombre de la agencia o el vehículo que consultaste, si lo recuerdas.
          <br />
          4. Confirmación de que pides el borrado y no solo darte de baja de mensajes.
        </p>
        <p>
          Si tienes sesión, también puedes ir a{" "}
          <Link to="/perfil" className="text-foreground underline underline-offset-4">
            Perfil
          </Link>{" "}
          y usar “Eliminar cuenta”. Eso borra tu usuario en la app; el correo sigue siendo la vía para un
          borrado que Meta o un cliente externo solicite por escrito.
        </p>
      </LegalSection>

      <LegalSection title="3. Qué eliminamos">
        <p>Tras verificar la identidad de quien pide el borrado:</p>
        <p>
          • Cuenta: nombre, correo, teléfono y perfil del negocio.
          <br />
          • Inventario, FAQs, financiamiento, promociones y configuración del bot.
          <br />
          • Leads, conversaciones y el historial de mensajes que guardamos.
          <br />
          • Conexión de WhatsApp/Meta (token, WABA, phone number id o page id).
        </p>
        <p>
          Podemos conservar el tiempo estrictamente necesario registros de seguridad o datos que la ley
          mexicana nos obligue a retener. Esos restos no se usan para contactarte por WhatsApp.
        </p>
      </LegalSection>

      <LegalSection title="4. Plazo">
        <p>
          Confirmamos la recepción en un máximo de 5 días hábiles y completamos el borrado operativo en un
          máximo de 30 días naturales, salvo que una obligación legal impida borrar algún dato concreto; en
          ese caso te lo diremos.
        </p>
      </LegalSection>

      <LegalSection title="5. Si conectaste WhatsApp o Facebook">
        <p>
          Eliminar tu cuenta en AutoBot no borra automáticamente tu perfil de Facebook ni tu WhatsApp
          Business en Meta. Si también quieres desconectar la app de Meta, usa la configuración de Facebook
          (Configuración → Aplicaciones y sitios web) o WhatsApp Business → Cuenta → Plataforma de
          negocios, según el flujo que hayas usado.
        </p>
        <p>
          Esta URL es la instrucción de eliminación de datos de usuario que Meta solicita para nuestra
          aplicación. No es un callback automático: el borrado lo ejecutamos nosotros al recibir tu
          solicitud.
        </p>
      </LegalSection>

      <LegalSection title="6. Contacto">
        <p>
          {LEGAL_COMPANY}
          <br />
          Correo:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
        <p>
          <Link to="/privacidad" className="text-foreground underline underline-offset-4">
            Política de privacidad
          </Link>
          {" · "}
          <Link to="/terminos" className="text-foreground underline underline-offset-4">
            Condiciones del servicio
          </Link>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
