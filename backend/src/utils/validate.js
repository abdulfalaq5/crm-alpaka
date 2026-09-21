const { unprocessable } = require('./http');

// Validasi payload dengan skema Joi; pesan error dikembalikan per-field agar mudah ditampilkan di form.
function validate(schema, payload) {
  const { value, error } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    const details = {};
    for (const d of error.details) {
      const key = d.path.join('.') || '_';
      if (!details[key]) details[key] = d.message.replace(/"/g, '');
    }
    throw unprocessable(Object.values(details)[0], details);
  }
  return value;
}

module.exports = { validate };
