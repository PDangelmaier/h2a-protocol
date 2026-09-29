CREATE TYPE notification_status AS ENUM ('scheduled', 'sent', 'delivered', 'failed', 'cancelled');

CREATE TABLE scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  channel channel_type NOT NULL,
  notification_type TEXT NOT NULL,
  content JSONB NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status notification_status DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_scheduled ON scheduled_notifications(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_notifications_customer ON scheduled_notifications(customer_id);
