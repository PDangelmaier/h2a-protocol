-- SPEC-002: Add status_message column to agent_tools for partial streaming
ALTER TABLE agent_tools ADD COLUMN IF NOT EXISTS status_message TEXT;

UPDATE agent_tools SET status_message = 'Suche Fahrzeuge...' WHERE tool_name = 'vehicle_catalog';
UPDATE agent_tools SET status_message = 'Konfiguriere Fahrzeug...' WHERE tool_name = 'configurator';
UPDATE agent_tools SET status_message = 'Berechne Finanzierung...' WHERE tool_name = 'financing_calculator';
UPDATE agent_tools SET status_message = 'Suche Händler in Ihrer Nähe...' WHERE tool_name = 'dealer_inventory';
UPDATE agent_tools SET status_message = 'Buche Probefahrt...' WHERE tool_name = 'test_drive_booking';
UPDATE agent_tools SET status_message = 'Buche Servicetermin...' WHERE tool_name = 'service_booking';
UPDATE agent_tools SET status_message = 'Prüfe Rückrufe...' WHERE tool_name = 'recall_check';
UPDATE agent_tools SET status_message = 'Prüfe Bestellstatus...' WHERE tool_name = 'order_status';
UPDATE agent_tools SET status_message = 'Erstelle Konfiguration...' WHERE tool_name = 'configurator.create_config';
UPDATE agent_tools SET status_message = 'Ändere Option...' WHERE tool_name = 'configurator.modify_option';
UPDATE agent_tools SET status_message = 'Berechne Preis...' WHERE tool_name = 'configurator.get_pricing';
UPDATE agent_tools SET status_message = 'Speichere Konfiguration...' WHERE tool_name = 'configurator.save_config';
UPDATE agent_tools SET status_message = 'Erstelle Teilen-Link...' WHERE tool_name = 'configurator.share_config';
UPDATE agent_tools SET status_message = 'Prüfe Fahrzeugstatus...' WHERE tool_name = 'vehicle.get_status';
UPDATE agent_tools SET status_message = 'Führe Fahrzeugbefehl aus...' WHERE tool_name = 'vehicle.remote_control';
UPDATE agent_tools SET status_message = 'Ermittle Fahrzeugstandort...' WHERE tool_name = 'vehicle.get_location';
UPDATE agent_tools SET status_message = 'Lade Servicehistorie...' WHERE tool_name = 'service.get_history';
UPDATE agent_tools SET status_message = 'Schätze Servicekosten...' WHERE tool_name = 'service.estimate_cost';
UPDATE agent_tools SET status_message = 'Prüfe Finanzierungsoptionen...' WHERE tool_name = 'finance.check_eligibility';
UPDATE agent_tools SET status_message = 'Füge zum Warenkorb hinzu...' WHERE tool_name = 'store.add_to_cart';
UPDATE agent_tools SET status_message = 'Bereite Checkout vor...' WHERE tool_name = 'store.checkout';
UPDATE agent_tools SET status_message = 'Verwalte Abonnement...' WHERE tool_name = 'subscription.manage';
UPDATE agent_tools SET status_message = 'Suche Ladestationen...' WHERE tool_name = 'charging.find_station';
UPDATE agent_tools SET status_message = 'Starte Ladevorgang...' WHERE tool_name = 'charging.start_session';
