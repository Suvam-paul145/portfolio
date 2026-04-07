require("dotenv").config();

const { getHealthPayload } = require("../lib/contact-service");

module.exports = async (_req, res) => {
  const payload = await getHealthPayload();
  return res.status(200).json(payload);
};
