import {
  createFollowupTemplate as defaultCreateFollowupTemplate,
  getFollowupTemplate as defaultGetFollowupTemplate,
  updateFollowupTemplate as defaultUpdateFollowupTemplate,
} from "../services/whatsappFollowupTemplateService.js";

export const getFollowupTemplateHandler = async (
  req,
  res,
  next,
  { getFollowupTemplate = defaultGetFollowupTemplate } = {}
) => {
  try {
    const payload = await getFollowupTemplate({ ownerUserId: req.auth.userId });
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
};

export const postFollowupTemplateHandler = async (
  req,
  res,
  next,
  { createFollowupTemplate = defaultCreateFollowupTemplate } = {}
) => {
  try {
    const payload = await createFollowupTemplate({
      ownerUserId: req.auth.userId,
      body: req.body?.body,
    });
    return res.status(201).json(payload);
  } catch (err) {
    return next(err);
  }
};

export const putFollowupTemplateHandler = async (
  req,
  res,
  next,
  { updateFollowupTemplate = defaultUpdateFollowupTemplate } = {}
) => {
  try {
    const payload = await updateFollowupTemplate({
      ownerUserId: req.auth.userId,
      body: req.body?.body,
    });
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
};
