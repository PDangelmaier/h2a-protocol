-- Default routing rules for CCP personalities
-- References personality IDs by slug subquery

-- sales_advisor: default for web, smart_storefront, whatsapp, dealer
INSERT INTO ccp_routing_rules (personality_id, priority, channel, journey_phase, intent_min, pid_min, market, is_active) VALUES
((SELECT id FROM ccp_personalities WHERE slug = 'sales_advisor'), 100, 'web', NULL, NULL, NULL, NULL, true),
((SELECT id FROM ccp_personalities WHERE slug = 'sales_advisor'), 100, 'smart_storefront', NULL, NULL, NULL, NULL, true),
((SELECT id FROM ccp_personalities WHERE slug = 'sales_advisor'), 100, 'whatsapp', NULL, NULL, NULL, NULL, true),
((SELECT id FROM ccp_personalities WHERE slug = 'sales_advisor'), 100, 'dealer', NULL, NULL, NULL, NULL, true),
-- sales_advisor: higher priority for configuration/pricing/purchase phases
((SELECT id FROM ccp_personalities WHERE slug = 'sales_advisor'), 200, NULL, 'configuration', NULL, NULL, NULL, true),
((SELECT id FROM ccp_personalities WHERE slug = 'sales_advisor'), 200, NULL, 'pricing', NULL, NULL, NULL, true),
((SELECT id FROM ccp_personalities WHERE slug = 'sales_advisor'), 200, NULL, 'purchase', NULL, NULL, NULL, true);

-- service_companion: default for app, mbux
INSERT INTO ccp_routing_rules (personality_id, priority, channel, journey_phase, intent_min, pid_min, market, is_active) VALUES
((SELECT id FROM ccp_personalities WHERE slug = 'service_companion'), 100, 'app', NULL, NULL, NULL, NULL, true),
((SELECT id FROM ccp_personalities WHERE slug = 'service_companion'), 100, 'mbux', NULL, NULL, NULL, NULL, true),
-- service_companion: higher priority for service/ownership phases
((SELECT id FROM ccp_personalities WHERE slug = 'service_companion'), 200, NULL, 'service', NULL, NULL, NULL, true),
((SELECT id FROM ccp_personalities WHERE slug = 'service_companion'), 200, NULL, 'ownership', NULL, NULL, NULL, true);

-- brand_ambassador: awareness phase with high PID
INSERT INTO ccp_routing_rules (personality_id, priority, channel, journey_phase, intent_min, pid_min, market, is_active) VALUES
((SELECT id FROM ccp_personalities WHERE slug = 'brand_ambassador'), 150, NULL, 'awareness', NULL, 60, NULL, true),
-- brand_ambassador: voice channel (Alexa, etc.)
((SELECT id FROM ccp_personalities WHERE slug = 'brand_ambassador'), 100, 'voice', NULL, NULL, NULL, NULL, true);
