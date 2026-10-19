/* ==========================================================================
   OTR Detailing — public configuration
   These values are safe to publish: the Supabase anon key only allows what
   the database's row-level security permits, and a Stripe publishable key
   can't move money. Secret keys live in Supabase Edge Function secrets only.
   ========================================================================== */
window.OTR_CONFIG = {
  supabaseUrl: "https://banccxqxuidvyczkhopj.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbmNjeHF4dWlkdnljemtob3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MzEyOTYsImV4cCI6MjEwODAwNzI5Nn0.LCMkp9ruV0kz8BroM_oNy4mahxBLjHo4BXOT6GXNV9g",
  stripePublishableKey: "",
  instagramUrl: "https://www.instagram.com/otrdetailing.uk/",
  contactEmail: "otr.detailinguk@gmail.com",
};
