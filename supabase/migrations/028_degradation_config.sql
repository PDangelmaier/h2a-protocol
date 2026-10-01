-- SPEC-026: Graceful Degradation — configurable messages + contact options
CREATE TABLE degradation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale TEXT NOT NULL DEFAULT 'de',
  message TEXT NOT NULL,
  contact_options JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (locale, is_active)
);

INSERT INTO degradation_config (locale, message, contact_options) VALUES
  ('de', 'Entschuldigung, ich kann Ihre Anfrage gerade nicht verarbeiten. Bitte nutzen Sie einen der folgenden Wege, um mit uns in Kontakt zu treten:', '[{"type":"phone","label":"Mercedes-Benz Kundenservice","value":"+49 (0)800 000 0000"},{"type":"web","label":"Kontaktformular","value":"https://www.mercedes-benz.de/passengercars/content-pool/tool-pages/contact.html"}]'),
  ('en', 'I am sorry, I cannot process your request right now. Please use one of the following options to get in touch with us:', '[{"type":"phone","label":"Mercedes-Benz Customer Service","value":"+49 (0)800 000 0000"},{"type":"web","label":"Contact Form","value":"https://www.mercedes-benz.de/passengercars/content-pool/tool-pages/contact.html"}]');
