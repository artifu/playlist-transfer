select
  'PX-' || upper(substr(id, 1, 8)) as reference,
  category,
  reply_email,
  message,
  status,
  created_at
from support_requests
order by created_at desc
limit 50;
