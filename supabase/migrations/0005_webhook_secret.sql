-- Every workspace gets a webhook secret so one leaked secret cannot be used to
-- forge deliveries for another venture.
update workspaces
   set webhook_secret = encode(gen_random_bytes(32), 'hex')
 where webhook_secret is null;
