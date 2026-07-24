-- Admins reject upload requests with a reason that is shown to the requester.
alter table marketplace_upload_requests add column rejection_reason text;
