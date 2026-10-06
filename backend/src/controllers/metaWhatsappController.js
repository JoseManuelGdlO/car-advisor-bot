import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { integrationDto } from "./integrationsController.js";
import { ApiError } from "../utils/errors.js";
import {
  completeEmbeddedSignup,
  disconnectMetaWhatsapp,
  publicMetaSignupConfig,
} from "../services/metaSignupService.js";
import { createMetaSignupTicket, getMetaSignupTicketStatus } from "../services/metaSignupTicketService.js";
import {
  META_WHATSAPP_PROVIDER,
  WHATSAPP_CHANNEL,
  resolveMetaWhatsappIntegrationById,
} from "../services/integrationResolverService.js";
import { sendWhatsappText } from "../services/metaWhatsappClient.js";

const findActiveMetaWhatsappIntegration = async (ownerUserId) =>
  ChannelIntegration.findOne({
    where: {
      ownerUserId,
      channel: WHATSAPP_CHANNEL,
      provider: META_WHATSAPP_PROVIDER,
      status: "active",
    },
    order: [["updatedAt", "DESC"]],
  });

export const postMetaSignupTicket = async (req, res, next) => {
  try {
    const result = await createMetaSignupTicket(req.auth.userId);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
};

export const getMetaSignupTicket = async (req, res, next) => {
  try {
    const result = await getMetaSignupTicketStatus({
      ownerUserId: req.auth.userId,
      ticket: req.query?.ticket,
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
};

export const getMetaSignupConfig = async (_req, res, next) => {
  try {
    return res.json(publicMetaSignupConfig());
  } catch (err) {
    return next(err);
  }
};

export const postMetaEmbeddedSignup = async (req, res, next) => {
  try {
    const result = await completeEmbeddedSignup({
      ownerUserId: req.auth.userId,
      code: req.body?.code,
      wabaId: req.body?.wabaId || req.body?.waba_id,
      phoneNumberId: req.body?.phoneNumberId || req.body?.phone_number_id,
      businessId: req.body?.businessId || req.body?.business_id,
      event: req.body?.event,
    });
    return res.status(201).json(await integrationDto(result.integration));
  } catch (err) {
    return next(err);
  }
};

export const postMetaDisconnect = async (req, res, next) => {
  try {
    const result = await disconnectMetaWhatsapp({ ownerUserId: req.auth.userId });
    const row = await ChannelIntegration.findOne({
      where: {
        id: result.integrationId,
        ownerUserId: req.auth.userId,
        channel: WHATSAPP_CHANNEL,
        provider: META_WHATSAPP_PROVIDER,
      },
    });
    return res.json(row ? await integrationDto(row) : { ok: true, ...result });
  } catch (err) {
    return next(err);
  }
};

export const getWhatsappMetaStatus = async (req, res, next) => {
  try {
    const ownerUserId = req.auth.userId;
    const integration = await findActiveMetaWhatsappIntegration(ownerUserId);
    if (!integration) {
      return res.json({
        provider: "meta",
        configured: false,
        wabaId: null,
        phoneNumberId: null,
        displayPhoneNumber: null,
      });
    }
    const cred = await ChannelCredential.findOne({
      where: { ownerUserId, channelIntegrationId: integration.id, isActive: true },
    });
    return res.json({
      provider: "meta",
      configured: Boolean(cred),
      wabaId: integration.wabaId || null,
      phoneNumberId: integration.phoneNumberId || null,
      displayPhoneNumber: integration.displayPhoneNumber || null,
    });
  } catch (err) {
    return next(err);
  }
};

export const postMetaWhatsappSendTest = async (req, res, next) => {
  try {
    const to = String(req.body?.to || "").trim();
    const text = String(req.body?.text || "").trim();
    if (!to) throw new ApiError(400, "El destino es obligatorio.");
    if (!text) throw new ApiError(400, "El texto es obligatorio.");

    const ownerUserId = req.auth.userId;
    const integration = await findActiveMetaWhatsappIntegration(ownerUserId);
    if (!integration) {
      throw new ApiError(400, "No hay una integración de WhatsApp (Meta) activa.");
    }

    const { credentials } = await resolveMetaWhatsappIntegrationById({
      ownerUserId,
      integrationId: integration.id,
    });
    await sendWhatsappText({
      phoneNumberId: credentials.phoneNumberId,
      accessToken: credentials.accessToken,
      to,
      text,
    });
    return res.status(202).json({ ok: true });
  } catch (err) {
    return next(err);
  }
};
