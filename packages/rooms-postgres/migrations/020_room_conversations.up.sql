ALTER TABLE __AGENTPLAT_SCHEMA__.messages
  ADD COLUMN thread_id text,
  ADD COLUMN reply_to_message_id text,
  ADD COLUMN target_participant_id text,
  ADD CONSTRAINT messages_room_identity UNIQUE (tenant_id, room_id, id),
  ADD CONSTRAINT messages_thread_room_fk FOREIGN KEY (tenant_id, room_id, thread_id)
    REFERENCES __AGENTPLAT_SCHEMA__.messages (tenant_id, room_id, id),
  ADD CONSTRAINT messages_reply_room_fk FOREIGN KEY (tenant_id, room_id, reply_to_message_id)
    REFERENCES __AGENTPLAT_SCHEMA__.messages (tenant_id, room_id, id),
  ADD CONSTRAINT messages_target_room_fk FOREIGN KEY (tenant_id, room_id, target_participant_id)
    REFERENCES __AGENTPLAT_SCHEMA__.room_participants (tenant_id, room_id, participant_id),
  ADD CONSTRAINT messages_conversation_shape CHECK (
    (thread_id IS NULL AND reply_to_message_id IS NULL) OR
    (thread_id = id AND reply_to_message_id IS NULL) OR
    (thread_id IS NOT NULL AND thread_id <> id AND reply_to_message_id IS NOT NULL AND reply_to_message_id <> id)
  );

CREATE INDEX messages_thread_page ON __AGENTPLAT_SCHEMA__.messages
  (tenant_id, room_id, thread_id, created_at, id COLLATE "C");
CREATE INDEX messages_roots_page ON __AGENTPLAT_SCHEMA__.messages
  (tenant_id, room_id, created_at, id COLLATE "C") WHERE reply_to_message_id IS NULL;

ALTER TABLE __AGENTPLAT_SCHEMA__.tasks
  ADD COLUMN thread_id text,
  ADD COLUMN reply_to_message_id text,
  ADD CONSTRAINT tasks_thread_room_fk FOREIGN KEY (tenant_id, room_id, thread_id)
    REFERENCES __AGENTPLAT_SCHEMA__.messages (tenant_id, room_id, id),
  ADD CONSTRAINT tasks_reply_room_fk FOREIGN KEY (tenant_id, room_id, reply_to_message_id)
    REFERENCES __AGENTPLAT_SCHEMA__.messages (tenant_id, room_id, id),
  ADD CONSTRAINT tasks_conversation_shape CHECK ((thread_id IS NULL) = (reply_to_message_id IS NULL));
