import { ChannelCredential, ChannelIntegration } from "../models/index.js";
import { integrationDto } from "./integrationsController.js";
import {
  completeEmbeddedSignup,
  disconnectMetaWhatsapp,
  publicMetaSignupConfig,
} from "../services/metaSignupService.js";
import { META_WHATSAPP_PROVIDER, WHATSAPP_CHANNEL } from "../services/integrationResolverService.js";

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
    const integration = await ChannelIntegration.findOne({
      where: {
        ownerUserId,
        channel: WHATSAPP_CHANNEL,
        provider: META_WHATSAPP_PROVIDER,
        status: "active",
      },
      order: [["updatedAt", "DESC"]],
    });
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
