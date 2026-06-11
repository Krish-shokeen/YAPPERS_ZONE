# Requirements Document

## Introduction

YAPPERS_ZONE is an existing React + Vite / Node.js + Express application that currently handles user
authentication via Firebase and profile management via MongoDB. This spec defines the requirements for
adding a full-featured real-time chat system — **YAPPERS_ZONE Chat** — on top of that foundation.

The chat system will be built in six ordered phases:

1. Authentication bridge (Firebase → JWT for Socket.io)
2. Core Socket.io events: plain-text 1-on-1 direct messaging
3. Group channels, presence indicators, and typing indicators
4. Message delivery status, media/file sharing, and end-to-end encryption
5. Rapid message search and smart filtering
6. Voice and video calls via WebRTC

The UI is built around the **Cosmic Canvas** design system — an immersive dark-mode spatial
interface where conversations are visualized as floating circular orbital nodes on a deep navy
canvas, governed by Zone Gravity physics. The Cosmic Canvas replaces traditional list-based
navigation with seven distinct views: Yappers Hub (main canvas), Expanded Chat View, Cosmic
Explorer (zone discovery), Zone Ignition System (creation wizard), Zone Observation Deck
(analytics and moderation), Whisper Stream (direct messages), and the User Profile & Settings
page. Glassmorphism panels, iridescent cyan glows, and cyberpunk-purple accent colors define the
visual language across all views.

---

## Glossary

- **Auth_Service**: The backend module responsible for validating Firebase ID tokens and issuing
  Chat_JWTs used by Socket.io connections.
- **Chat_JWT**: A JSON Web Token issued by Auth_Service, scoped to chat operations, carrying
  `userId`, `firebaseUid`, `email`, and `displayName`.
- **Socket_Server**: The Socket.io server layer attached to the Express HTTP server, handling all
  real-time WebSocket events.
- **Message_Service**: The backend module that persists, retrieves, and manages chat messages in
  MongoDB.
- **Encryption_Service**: The client-side module responsible for generating key pairs, encrypting
  outbound messages, and decrypting inbound messages using E2E encryption.
- **Search_Service**: The backend module that indexes message content and executes full-text and
  filtered queries.
- **Media_Service**: The backend module that validates, stores, and serves uploaded media and file
  attachments.
- **WebRTC_Service**: The backend signalling module that coordinates WebRTC peer connections for
  voice and video calls.
- **Presence_Service**: The backend module (backed by Redis) that tracks and broadcasts user
  online/offline/away states.
- **Channel**: A named, multi-user chat room that any authenticated user may join.
- **Direct_Message (DM)**: A private 1-on-1 conversation between exactly two users.
- **Message**: A single unit of communication within a Channel or DM, consisting of content,
  metadata, and optional media attachments.
- **Delivery_Status**: The lifecycle state of a Message — one of `sent`, `delivered`, or `read`.
- **Typing_Indicator**: A transient signal broadcast to conversation participants when a user is
  actively composing a message.
- **Reaction**: An emoji response attached to a Message by a user.
- **Thread**: A sub-conversation branching from a parent Message.
- **Sidebar**: The minimalist translucent left panel containing icons for Search, New Zone,
  Settings, and the user's Profile avatar with status dot.
- **Chat_Pane**: The central workspace area that renders the active conversation or view content
  on the Cosmic Canvas.
- **Zone**: A named conversation space, either a 1-on-1 Direct_Message or a multi-user Channel,
  visualized as an Orbital Node on the Cosmic Canvas.
- **Orbital_Node**: A floating circular UI element on the Cosmic Canvas that represents a single
  Zone, containing stylized user avatars and responding to Zone Gravity physics.
- **Galaxy_Cluster**: A visual grouping of related Orbital_Nodes on the Cosmic Canvas that orbit
  a common focal point, representing a thematic collection of Zones (e.g., Gaming Zone, Study Zone).
- **Comet_Input**: A floating semi-transparent text input field that dynamically docks below the
  selected Orbital_Node, moves with that node, and trails a light effect during movement.
- **Zone_Gravity**: The physics-based behavioral system that scales, brightens, and repositions
  Orbital_Nodes in real time according to their activity level — active nodes migrate toward the
  viewport center; inactive nodes drift toward the periphery.
- **Whisper_Stream**: The Cosmic Canvas view dedicated to private 1-on-1 Direct_Message
  conversations, rendered as a flowing ribbon of light connecting the user to the selected contact.
- **Ignition_Orb**: The interactive multi-color glowing sphere displayed at the center of the Zone
  Ignition System creation wizard, whose visual state (color, pulse rate, size) reflects the
  current zone configuration.
- **Cosmic_Explorer**: The multi-pane glass-scope overlay view used for discovering and joining
  new Zones and Galaxy Clusters.
- **Zone_Observation_Deck**: The data-rich administration dashboard view that replaces the canvas
  content for moderators and zone owners, displaying analytics charts and a moderation queue.
- **Zonal_Navigation_Bar**: The floating glass bar at the top of the Cosmic Canvas containing Zone
  Search and filter tags (Active, Muted, Friends).

---

## Requirements

### Requirement 1: Authentication Bridge

**User Story:** As an authenticated YAPPERS_ZONE user, I want to obtain a Chat_JWT from my existing
Firebase session, so that I can connect to the Socket_Server without re-entering my credentials.

#### Acceptance Criteria

1. WHEN a logged-in user requests a Chat_JWT by presenting a valid Firebase ID token, THE
   Auth_Service SHALL verify the Firebase ID token using Firebase Admin SDK and, upon success, issue
   a signed Chat_JWT with a 24-hour expiry containing `userId`, `firebaseUid`, `email`, and
   `displayName`.
2. IF the provided Firebase ID token is expired or invalid, THEN THE Auth_Service SHALL return an
   error response indicating authentication failure with code `AUTH_TOKEN_INVALID` and SHALL NOT
   issue a Chat_JWT.
3. IF no Firebase ID token is present in the Chat_JWT request, THEN THE Auth_Service SHALL return
   an error response indicating a missing token with code `AUTH_TOKEN_MISSING` and SHALL NOT issue
   a Chat_JWT.
4. WHEN a client attempts to establish a WebSocket connection, IF the connection handshake does not
   include a valid Chat_JWT, THEN THE Socket_Server SHALL emit an `auth_error` event to the client
   and close the connection with close code 4001.
5. IF a Chat_JWT presented during a WebSocket handshake is expired or has an invalid signature,
   THEN THE Socket_Server SHALL emit an `auth_error` event to the client and close the connection
   with close code 4001.
6. WHEN the Auth_Service rotates Chat_JWT signing keys, THE Auth_Service SHALL continue accepting
   tokens signed with the immediately preceding key for a 5-minute overlap window, after which
   tokens signed with the old key SHALL be rejected.

---

### Requirement 2: Real-Time 1-on-1 Direct Messaging

**User Story:** As an authenticated user, I want to send and receive plain-text messages to another
user in real time, so that I can have private conversations.

#### Acceptance Criteria

1. WHEN a user emits a `dm:send` event with a valid recipient `userId` and non-empty `content`
   string of at most 4000 characters, THE Socket_Server SHALL persist the Message to MongoDB via
   Message_Service and emit a `dm:receive` event to the recipient's active socket within 300 ms.
2. IF the recipient is not currently connected, THEN THE Socket_Server SHALL persist the Message
   with Delivery_Status `sent` and, when the recipient next connects, deliver it via `dm:receive`
   and update Delivery_Status to `delivered`.
3. THE Message_Service SHALL assign each Message a globally unique `messageId` (UUIDv4) at
   creation time.
4. IF `content` is empty or exceeds 4000 characters, THEN THE Socket_Server SHALL emit a
   `dm:error` event to the sender with error code `MESSAGE_INVALID` and SHALL NOT persist the
   Message.
5. THE Message_Service SHALL store each Message with the fields: `messageId`, `senderId`,
   `recipientId` or `channelId`, `content`, `deliveryStatus`, `createdAt`, `updatedAt`, and
   `encryptedPayload` (nullable).
6. IF Message_Service fails to persist a Message to MongoDB, THEN THE Socket_Server SHALL emit a
   `dm:error` event to the sender with error code `MESSAGE_PERSIST_FAILED` and SHALL NOT emit
   `dm:receive` to the recipient.
7. WHEN a `dm:receive` event is successfully emitted to the recipient's active socket, THE
   Message_Service SHALL update the Message's Delivery_Status to `delivered`.

---

### Requirement 3: Persistent Chat History

**User Story:** As a user, I want my conversation history to be available after a page refresh or
reconnection, so that I never lose context from prior conversations.

#### Acceptance Criteria

1. WHEN a user opens a DM conversation, THE Message_Service SHALL return the 50 most recent
   Messages for that conversation ordered from newest to oldest by Message timestamp.
2. WHEN a client submits a pagination request with a cursor set to the timestamp of the oldest
   currently loaded Message, THE Message_Service SHALL return the next 50 Messages with timestamps
   strictly earlier than the cursor, ordered from newest to oldest.
3. WHEN fewer than 50 Messages are returned for a pagination request, THE Message_Service SHALL
   include an end-of-history indicator in the response to signal that no older Messages exist.
4. THE Message_Service SHALL return paginated results within 500 ms, measured from the time the
   request is received to the time the full response is sent, for conversations containing up to
   100,000 Messages.
5. IF the requesting user is not a participant in the requested conversation, THEN THE
   Message_Service SHALL reject the request with an error response indicating unauthorized access.
6. WHEN the database restarts or reconnects, THE Message_Service SHALL continue to return each
   Message's sender identifier, content, and timestamp without data loss.

---

### Requirement 4: Group Channels

**User Story:** As a user, I want to create and join named group channels so that I can communicate
with multiple people simultaneously.

#### Acceptance Criteria

1. WHEN an authenticated user submits a channel creation request with a unique `name` (3–80
   characters, alphanumeric plus hyphens) and optional `description` (up to 500 characters), THE
   Message_Service SHALL create a Channel document in MongoDB and add the creator as the first
   member with role `owner`.
2. IF a channel `name` already exists (case-insensitive comparison), THEN THE Message_Service SHALL
   return an error response with code `CHANNEL_NAME_TAKEN` and SHALL NOT create the Channel.
3. WHEN an authenticated user emits a `channel:join` event with a valid `channelId`, THE
   Socket_Server SHALL add the user to the corresponding Socket.io room and update the Channel's
   member list in MongoDB.
4. WHEN a member sends a message to a Channel, THE Socket_Server SHALL persist the Message and
   broadcast it to all members currently in the Socket.io room within 300 ms.
5. IF a user emits a `channel:send` event for a Channel of which the user is not a member, THEN
   THE Socket_Server SHALL emit a `channel:error` event with error code `NOT_A_MEMBER` and SHALL
   NOT persist the Message.
6. IF a user emits a `channel:join` event with a `channelId` that does not exist, THEN THE
   Socket_Server SHALL emit a `channel:error` event with error code `CHANNEL_NOT_FOUND` and SHALL
   NOT add the user to any room.
7. THE Message_Service SHALL allow channels to have up to 1,000 members; IF a `channel:join` event
   is received when the channel already has 1,000 members, THEN THE Socket_Server SHALL emit a
   `channel:error` event with error code `CHANNEL_FULL`.

---

### Requirement 5: Online/Offline Presence Indicators

**User Story:** As a user, I want to see whether my contacts are online or offline in real time, so
that I know when they are available to chat.

#### Acceptance Criteria

1. WHEN a user establishes a WebSocket connection, THE Presence_Service SHALL set the user's
   status to `online` in the presence store.
2. WHEN a user's status is set to `online`, THE Presence_Service SHALL broadcast a
   `presence:update` event containing `userId` and status `online` to all users who share at least
   one DM or Channel with the connecting user.
3. WHEN a user's WebSocket connection closes cleanly, THE Presence_Service SHALL set the user's
   status to `offline` in the presence store and broadcast a `presence:update` event with status
   `offline` to the same audience as criterion 2.
4. IF a user's WebSocket connection drops without a clean close and no heartbeat signal is received
   within 10 seconds, THEN THE Presence_Service SHALL set the user's status to `offline` and
   broadcast a `presence:update` event to the same audience as criterion 2.
5. IF the presence store write fails, THEN THE Presence_Service SHALL retry up to 3 times at
   1-second intervals before logging the error and continuing.
6. WHEN a presence query is received for up to 500 users, THE Presence_Service SHALL return all
   requested statuses within 100 ms by reading from the presence store.
7. WHEN the Sidebar first renders, THE Sidebar SHALL query the Presence_Service for the current
   status of all contacts and display their statuses before any `presence:update` events arrive.
8. WHEN a `presence:update` event is received, THE Sidebar SHALL update the visual indicator
   (green dot = online, grey dot = offline) for the relevant contact within 2 seconds.

---

### Requirement 6: Typing Indicators

**User Story:** As a user, I want to see a "User is typing…" indicator when my conversation partner
is composing a message, so that I know a reply is coming.

#### Acceptance Criteria

1. WHEN a user begins typing in the message input, THE Chat_Pane SHALL emit a `typing:start` event
   containing `conversationId` and `userId` to the Socket_Server at most once every 2 seconds,
   and SHALL stop emitting after the user has not typed for 3 seconds.
2. WHEN THE Socket_Server receives a `typing:start` event, THE Socket_Server SHALL broadcast a
   `typing:started` event to all other participants in the conversation.
3. WHEN a user sends a message or the message input field contains no text, THE Chat_Pane SHALL
   emit a `typing:stop` event to the Socket_Server.
4. WHEN THE Socket_Server receives a `typing:stop` event from a user, THE Socket_Server SHALL
   broadcast a `typing:stopped` event to all other participants in the conversation.
5. WHEN THE Socket_Server receives a `typing:started` event for a user and then receives no further
   `typing:start` event from that user within 3 seconds, THE Socket_Server SHALL broadcast a
   `typing:stopped` event for that user to all other participants.
6. WHEN the Chat_Pane receives a `typing:started` event, THE Chat_Pane SHALL display
   "< displayName > is typing…" below the message list within 300 ms of receiving the event.
7. WHEN the Chat_Pane receives a `typing:stopped` event, THE Chat_Pane SHALL remove the typing
   indicator within 500 ms.
8. IF more than three users are simultaneously typing in a Channel, THE Chat_Pane SHALL display
   "Several people are typing…" instead of listing individual display names.

---

### Requirement 7: Message Delivery Status

**User Story:** As a sender, I want to see whether my message has been sent, delivered, and read,
so that I know it reached its recipient.

#### Acceptance Criteria

1. WHEN a Message is persisted by Message_Service, THE Message_Service SHALL set its
   Delivery_Status to `sent`.
2. WHEN a socket-level acknowledgement is received from the recipient's socket confirming receipt
   of a `dm:receive` or `channel:message` event, THE Message_Service SHALL update the Message's
   Delivery_Status to `delivered`.
3. WHEN THE Message_Service updates Delivery_Status to `delivered`, THE Socket_Server SHALL emit a
   `status:update` event containing `messageId` and status `delivered` to the sender's socket.
4. WHEN the recipient's Chat_Pane renders a Message such that at least 50% of the message element
   is visible in the viewport, THE Chat_Pane SHALL emit a `status:read` event for that `messageId`
   to the Socket_Server, at most once per unique `messageId`.
5. WHEN THE Socket_Server receives a `status:read` event, THE Message_Service SHALL update the
   Message's Delivery_Status to `read`.
6. WHEN THE Message_Service updates Delivery_Status to `read`, THE Socket_Server SHALL emit a
   `status:update` event containing `messageId` and status `read` to the original sender's socket.
7. IF the original sender is not connected when a `status:update` event is to be emitted, THEN THE
   Socket_Server SHALL re-emit the `status:update` event within 5 seconds of the sender
   reconnecting.
8. IF no socket-level acknowledgement is received from the recipient within 10 seconds of emitting
   a delivery event, THEN THE Message_Service SHALL retain the Message's Delivery_Status as `sent`
   without further retry.
9. THE Chat_Pane SHALL render Delivery_Status using distinct icons: a single grey tick for `sent`,
   double grey ticks for `delivered`, and double blue ticks for `read`.

---

### Requirement 8: Media and File Sharing

**User Story:** As a user, I want to send images, videos, and files in conversations, so that I can
share rich content with other users.

#### Acceptance Criteria

1. WHEN a user selects a file for upload, THE Media_Service SHALL accept files of type JPEG, PNG,
   GIF, WEBP, MP4, WEBM, PDF, DOCX, XLSX, and PPTX up to a maximum size of 50 MB per file.
2. IF a file exceeds 50 MB or has an unsupported MIME type, THEN THE Media_Service SHALL return an
   error response indicating the rejection reason and SHALL NOT store the file.
3. WHEN a file of up to 10 MB is accepted, THE Media_Service SHALL store it in a persistent object
   store, generate a time-limited (1-hour) signed URL, and return the `mediaId`, signed URL, and
   file metadata (name, size, MIME type) to the uploader within 5 seconds.
4. WHEN a file between 10 MB and 50 MB is accepted, THE Media_Service SHALL complete storage,
   URL generation, and metadata return within 30 seconds.
5. WHEN a media Message is delivered, THE Chat_Pane SHALL render JPEG, PNG, GIF, and WEBP files
   inline as a thumbnail with a click-to-expand interaction; MP4 and WEBM files as an inline
   player; and all other file types as a named file attachment with a download icon.
6. WHEN a file upload is accepted, THE Media_Service SHALL scan the file using a malware detection
   check before making it accessible, and SHALL NOT make the file accessible until the scan passes.
7. IF a malware scan fails for a file, THEN THE Media_Service SHALL quarantine the file, mark it
   with status `quarantined`, and notify the uploader that the file was rejected.
8. IF the malware scan service is unavailable at the time of upload, THEN THE Media_Service SHALL
   mark the file with status `scan_pending` and retry the scan within 60 seconds before making the
   file accessible.
9. IF a signed URL has expired and the recipient requests the media, THEN THE Media_Service SHALL
   generate a new signed URL on demand and return it within 2 seconds.

---

### Requirement 9: End-to-End Encryption

**User Story:** As a user, I want my Direct Messages to be end-to-end encrypted, so that only the
intended recipient can read them.

#### Acceptance Criteria

1. WHEN a user authenticates on a device for the first time, THE Encryption_Service SHALL generate
   an asymmetric key pair on that device, persist the private key in local device storage scoped to
   that user, and upload the corresponding public key to the backend. IF the user re-authenticates
   on the same device and a key pair already exists for that user, THE Encryption_Service SHALL
   reuse the existing key pair without generating a new one.
2. WHEN an authenticated user requests another user's public encryption key, THE Auth_Service SHALL
   return the stored public key for the requested user.
3. WHEN a user explicitly enables E2E encryption on a DM conversation and sends a message, THE
   Encryption_Service SHALL encrypt the message content using the recipient's public key and the
   sender's private key before transmission, and SHALL NOT transmit the plaintext content over the
   network.
4. WHEN the recipient's Chat_Pane receives an encrypted DM, THE Encryption_Service SHALL decrypt
   the encrypted payload using the recipient's private key and display the resulting plaintext to
   the recipient.
5. IF decryption of an encrypted payload fails, THEN THE Encryption_Service SHALL display an
   inline error in the Chat_Pane indicating the message could not be decrypted, and SHALL NOT
   display garbled or partial content.
6. IF the recipient's public key is unavailable when a user attempts to send an encrypted DM, THEN
   THE Encryption_Service SHALL notify the sender that the message cannot be sent and SHALL NOT
   send the message in plaintext.
7. THE Message_Service SHALL store only the encrypted payload for E2E-encrypted messages and SHALL
   NOT store or log the plaintext content at any point in the message lifecycle.
8. WHEN a new member joins a Channel that has E2E encryption enabled, THE Encryption_Service SHALL
   distribute the shared Channel encryption key to the new member encrypted with that member's
   public key.

---

### Requirement 10: Message Search and Smart Filtering

**User Story:** As a user, I want to search through my message history using keywords, sender
filters, and date ranges, so that I can quickly find specific conversations or content.

#### Acceptance Criteria

1. WHEN a user submits a valid search query, THE Search_Service SHALL return matching Messages from
   conversations the user participates in, ranked by relevance score in descending order (most
   relevant first), within 500 ms for indexes up to 10 million Messages.
2. WHEN a user submits a search request with one or more filters (sender, conversation, date range,
   or attachment flag), THE Search_Service SHALL apply all provided filters using AND logic and
   return only Messages that satisfy every specified filter.
3. IF a search request includes a date range where `fromDate` is after `toDate`, THEN THE
   Search_Service SHALL return an error response indicating an invalid date range.
4. WHEN a search query matches message content, THE Search_Service SHALL return a result that
   includes a highlight field containing the matched terms and up to 100 characters of surrounding
   context per match.
5. IF a search query is fewer than 2 characters or exceeds 200 characters, THEN THE Search_Service
   SHALL return an error response with code `QUERY_INVALID` and SHALL NOT execute the query.
6. WHEN a search query is executed, THE Search_Service SHALL return results only for Messages whose
   content is stored as plaintext; encrypted message content SHALL NOT be searched, and matches
   SHALL NOT include the plaintext of encrypted messages.
7. WHEN a valid search query returns no matching Messages, THE Search_Service SHALL return an empty
   result list with a count of zero and SHALL NOT return an error response.

---

### Requirement 11: Voice and Video Calls (Phase 6)

**User Story:** As a user, I want to initiate and receive voice and video calls with other users,
so that I can communicate beyond text.

#### Acceptance Criteria

1. WHEN a user initiates a call by emitting a `call:invite` event with a connected `recipientId`,
   a valid SDP offer, and `callType` of `audio` or `video`, THE WebRTC_Service SHALL relay the SDP
   offer to the recipient's socket via a `call:incoming` event.
2. IF a `call:invite` event is received with an invalid `callType` or a `recipientId` that does not
   correspond to a connected socket, THEN THE WebRTC_Service SHALL emit a `call:error` event to
   the caller with an appropriate error code and SHALL NOT relay the invite.
3. WHEN the recipient accepts the call by emitting a `call:accept` event with the SDP answer, THE
   WebRTC_Service SHALL relay the answer to the caller and relay ICE candidates between both peers;
   IF no direct peer connection is established within 30 seconds of ICE candidate exchange
   beginning, THE WebRTC_Service SHALL emit a `call:error` event with code `ICE_TIMEOUT` to both
   participants and terminate the session.
4. WHEN either participant emits a `call:end` event, THE WebRTC_Service SHALL emit a `call:ended`
   event to the other participant, cease relaying all events for that call session, and remove the
   call session record.
5. WHEN THE WebRTC_Service begins ICE candidate exchange, THE WebRTC_Service SHALL include
   configured STUN server addresses in the ICE candidate list to facilitate peer connection
   establishment across NAT boundaries.
6. IF the recipient does not respond to a `call:incoming` event within 30 seconds, THEN THE
   WebRTC_Service SHALL emit a `call:missed` event to the caller, log the missed call, and clean
   up the pending session.
7. IF a peer connection fails after ICE candidate exchange and a TURN relay server is configured,
   THEN THE WebRTC_Service SHALL attempt TURN relay fallback; IF the relay attempt also fails
   within 10 seconds, THE WebRTC_Service SHALL emit a `call:error` event with code
   `CALL_CONNECTION_FAILED` to both participants and clean up the session.
8. IF a `call:invite` event is received for a recipient who is already in an active call session,
   THEN THE WebRTC_Service SHALL emit a `call:busy` event to the caller and SHALL NOT relay the
   invite to the recipient.

---

### Requirement 12: Cosmic Canvas — Global Canvas Mechanics

**User Story:** As a user, I want conversations to be visualized as living, physics-driven orbital
nodes on an immersive dark canvas, so that the most relevant conversations are always visually
prominent and I can navigate intuitively without scrolling through flat lists.

#### Acceptance Criteria

1. THE Canvas SHALL render all Zones as Orbital_Nodes — floating circular elements containing
   stylized user avatars — on a deep navy blue / charcoal void base color in the range `#0a0e1a`
   to `#1c1f2e`, using a futuristic glassmorphism style with semi-transparent frosted-glass panel
   surfaces, blurred backdrops, and glowing edges.
2. THE Canvas SHALL apply the following Zone_Gravity physics to every Orbital_Node in real time:
   WHEN the message rate or active Typing_Indicator count for a Zone increases, THE Canvas SHALL
   scale the corresponding Orbital_Node up and increase its glow brightness within 500 ms; WHEN
   the Zone becomes inactive for 30 seconds, THE Canvas SHALL scale the node back to its default
   size and reduce glow brightness within 2 seconds.
3. WHILE a Zone has unread Messages, THE Canvas SHALL render the corresponding Orbital_Node with
   an iridescent cyan border glow (`#00e5ff` ± 10% hue); WHILE a Zone has recent activity but no
   unread Messages, THE Canvas SHALL render the Orbital_Node with a soft magenta/purple glow
   (`#c77dff` ± 10% hue).
4. WHEN an Orbital_Node transitions to an active or unread state as defined in criteria 2 and 3,
   THE Canvas SHALL animate the node migrating toward the center of the viewport within 800 ms;
   WHEN the same node returns to an inactive state, THE Canvas SHALL animate it drifting toward
   the periphery of the viewport within 2 seconds.
5. WHEN two or more Zones share a thematic grouping (e.g., Gaming Zone, Study Zone), THE Canvas
   SHALL render their Orbital_Nodes as a Galaxy_Cluster — a visual sub-system where the nodes
   orbit a shared focal point — and SHALL visually distinguish each Galaxy_Cluster from
   unaffiliated nodes.
6. WHEN a user selects an Orbital_Node, THE Canvas SHALL display the Comet_Input — a floating
   semi-transparent text input field — docked directly below the selected node; THE Comet_Input
   SHALL follow the node's position if Zone_Gravity moves it, and SHALL render a trailing light
   effect during movement.
7. THE Sidebar SHALL render as a minimalist translucent left panel containing icons for Search,
   New Zone, Settings, and the user's Profile avatar with a colored status dot, and SHALL maintain
   a backdrop blur of at least 8 px at all times.
8. THE Zonal_Navigation_Bar SHALL render as a floating glass bar at the top of the Canvas
   containing a Zone Search input and filter tag controls for Active, Muted, and Friends; WHEN a
   user selects a filter tag, THE Canvas SHALL update the visible Orbital_Nodes within 300 ms to
   show only Zones matching the selected filter.
9. THE Canvas primary glow accent color SHALL be electric cyan (`#00e5ff`); secondary accent
   colors SHALL be cyberpunk purple (`#7b2fff`) and soft pink / magenta (`#ff6ec7`); all
   interactive element text SHALL use a modern clean sans-serif typeface and maintain a minimum
   4.5:1 contrast ratio against their background surfaces.

---

### Requirement 13: Dark Mode

**User Story:** As a user, I want the application to automatically match my system's dark or light
mode preference, so that I have a comfortable viewing experience in any environment.

#### Acceptance Criteria

1. THE application SHALL read the operating system's color scheme preference before the first
   visible paint and apply the corresponding theme, so that no unstyled or incorrectly-themed
   content is rendered at any point during initial load.
2. WHILE dark mode is active, THE application SHALL use deep charcoal background colors in the
   range `#1a1a2e` to `#2d2d44` for all surface elements and SHALL NOT use pure black (`#000000`)
   as a background surface; text colors SHALL be chosen to maintain a minimum 4.5:1 contrast ratio
   against those background colors.
3. WHILE light mode is active, THE application SHALL use off-white background colors in the range
   `#f5f5f5` to `#ffffff` for surface elements; text colors SHALL be chosen to maintain a minimum
   4.5:1 contrast ratio against those background colors.
4. WHEN the operating system color scheme changes at runtime, THE application SHALL update the
   applied theme within 500 ms without requiring a page reload.
5. THE application SHALL maintain a minimum contrast ratio of 4.5:1 between text and its
   background surface in both dark and light themes, in compliance with WCAG 2.1 AA.
6. IF the operating system color scheme preference is unavailable or unreadable, THEN THE
   application SHALL apply the light mode theme as the default.

---

### Requirement 14: Message Reactions and Threads (Extended Features)

**User Story:** As a user, I want to react to messages with emojis and reply in threads, so that I
can engage with content without cluttering the main conversation.

#### Acceptance Criteria

1. WHEN a user selects a standard Unicode emoji from the reaction picker for a Message, THE
   Message_Service SHALL add a Reaction record (limited to a maximum of 20 distinct emoji per
   Message) and broadcast a `reaction:update` event to all conversation participants within 300 ms.
2. WHEN a user who has already reacted with the same emoji selects it again, THE Message_Service
   SHALL remove that user's Reaction for that emoji and broadcast a `reaction:update` event with
   the updated reaction counts.
3. WHEN the Chat_Pane receives a `reaction:update` event for a Message that has at least one
   Reaction, THE Chat_Pane SHALL display a reaction summary row below the Message showing each
   emoji and its count, updated within 500 ms of receiving the event.
4. WHEN a user clicks the "Reply in Thread" action on a Message, THE Chat_Pane SHALL open a Thread
   panel and load the parent Message along with the 50 most recent Thread replies in descending
   chronological order; WHEN the user scrolls to the top of the Thread panel, THE Chat_Pane SHALL
   load the next 50 older replies using the same cursor-based pagination as Requirement 3.
5. WHEN a user sends a Thread reply with content between 1 and 4000 characters, THE Message_Service
   SHALL persist the reply with a reference to the parent `messageId` and broadcast it to all
   participants who have that Thread panel open.
6. IF a Thread reply has empty content or content exceeding 4000 characters, THEN THE
   Message_Service SHALL return an error response with code `THREAD_REPLY_INVALID` and SHALL NOT
   persist the reply.

---

### Requirement 15: Yappers Hub — Main Navigation View

**User Story:** As a user, I want a panoramic canvas overview as my home screen that surfaces all
my active Galaxy Clusters and peripheral DM nodes at a glance, so that I can instantly orient
myself and jump into any conversation.

#### Acceptance Criteria

1. WHEN a user logs in or navigates to the root application route, THE Canvas SHALL render the
   Yappers Hub view displaying all of the user's Zones as Orbital_Nodes distributed across the
   canvas according to Zone_Gravity rules.
2. THE Yappers Hub SHALL group Zones that share a thematic affiliation into Galaxy_Clusters visually
   positioned in the central-to-mid region of the canvas; unaffiliated Direct_Message Orbital_Nodes
   SHALL be rendered on the canvas periphery.
3. THE Canvas SHALL render each Galaxy_Cluster with a distinct label (e.g., "Gaming Zone", "Study
   Zone", "Coffee Break") positioned above the cluster's focal point using the standard
   sans-serif typeface at a minimum font size of 14 px.
4. WHEN a user hovers over an Orbital_Node for more than 300 ms, THE Canvas SHALL display a
   tooltip overlay containing the Zone name, member count, and last activity timestamp within
   150 ms of the hover threshold being reached.
5. WHEN a user clicks an Orbital_Node in the Yappers Hub, THE Canvas SHALL transition to the
   Expanded Chat View for that Zone within 400 ms.
6. WHEN a new unread Message arrives in any Zone while the user is viewing the Yappers Hub, THE
   Canvas SHALL update the corresponding Orbital_Node's glow and position in accordance with
   Zone_Gravity rules (Requirement 12, criteria 2–4) without requiring a page reload.

---

### Requirement 16: Expanded Chat View — Focused Zone

**User Story:** As a user, I want to expand a Zone into a full chat workspace so that I can read
the full message history, reply, react, and access zone resources without leaving the canvas
environment.

#### Acceptance Criteria

1. WHEN a Zone is expanded, THE Chat_Pane SHALL render the selected Orbital_Node as a large
   rounded glass container dominating the central workspace, with a semi-transparent background,
   blurred backdrop, and glowing edge in the Zone's accent color.
2. THE Chat_Pane message transcript area SHALL render Messages sent by the current user right-
   aligned in a solid teal gradient glow bubble and Messages sent by other participants left-
   aligned in a subtle gray/purple gradient glow bubble.
3. WHEN a Message has one or more Reactions, THE Chat_Pane SHALL render reaction indicators
   directly below the message bubble showing each emoji and its count; WHEN a Message belongs to a
   Thread with at least one reply, THE Chat_Pane SHALL render a reply count indicator below the
   bubble.
4. WHEN the user's scroll position is not at the bottom of the transcript and unread Messages
   exist below, THE Chat_Pane SHALL display a transparent "Unread" marker with a glowing "Jump to
   Latest" control; WHEN the user activates the "Jump to Latest" control, THE Chat_Pane SHALL
   scroll to the most recent Message within 300 ms.
5. WHEN a Zone contains more than one participant, THE Chat_Pane SHALL render a circular avatar
   for each sender adjacent to their message bubble.
6. THE Chat_Pane SHALL render a collapsible right context panel with three tabs: a Zonal Shared
   Media tab displaying uploaded media in a grid layout, a Pinned Messages tab displaying pinned
   Messages as reference cards, and a Zone Members tab displaying member avatars in a grid.
7. WHEN the user activates the right context panel collapse toggle, THE Chat_Pane SHALL animate
   the panel off-screen within 200 ms, expanding the transcript area to fill the reclaimed space;
   WHEN the user activates the toggle again, THE Chat_Pane SHALL animate the panel back into view
   within 200 ms.
8. WHEN the user clicks outside the expanded Zone container or presses the Escape key, THE Canvas
   SHALL animate the Zone back to its Orbital_Node state and return to the Yappers Hub view within
   400 ms.

---

### Requirement 17: Cosmic Explorer — Zone Discovery

**User Story:** As a user, I want to discover and join new public Zones through a curated
exploration interface, so that I can find communities and conversations that match my interests.

#### Acceptance Criteria

1. WHEN a user activates the Cosmic Explorer, THE Canvas SHALL render a large multi-pane glass-
   scope overlay covering the central canvas workspace with a backdrop blur of at least 12 px.
2. THE Cosmic_Explorer SHALL display curated Discovery Clusters — constellation-like groupings of
   related Zones — with distinct visual grouping labels such as "Trending Tech", "Art Galaxies",
   and "Community Commons".
3. THE Cosmic_Explorer SHALL render each discoverable Zone as a Discovery Card containing: the
   Zone thumbnail or icon, the Zone name, a short description of up to 120 characters, and an
   activity stat showing the number of active members in the past 24 hours.
4. WHEN a user activates the "Join" action on a Discovery Card, THE Cosmic_Explorer SHALL trigger
   the `channel:join` flow defined in Requirement 4 criterion 3 and, upon successful join, add the
   Zone as an Orbital_Node on the user's canvas within 500 ms.
5. WHEN a user activates the "Learn More" action on a Discovery Card, THE Cosmic_Explorer SHALL
   expand the card to display the full Zone description, member list preview (up to 5 avatars), and
   recent public Message previews (up to 3 Messages).
6. WHEN a user closes the Cosmic_Explorer overlay, THE Canvas SHALL restore the previous canvas
   view within 300 ms.
7. IF a Zone displayed in the Cosmic_Explorer reaches its 1,000-member capacity as defined in
   Requirement 4 criterion 7, THEN THE Cosmic_Explorer SHALL replace the "Join" button with a
   "Zone Full" indicator and SHALL NOT allow the user to initiate a join for that Zone.

---

### Requirement 18: Zone Ignition System — Creation Wizard

**User Story:** As a user, I want a guided, visually engaging step-by-step wizard to create a new
Zone, so that I can configure and launch a new conversation space without needing to understand
underlying technical details.

#### Acceptance Criteria

1. WHEN a user activates the New Zone action in the Sidebar, THE Canvas SHALL render the Zone
   Ignition System as a step-by-step glass pane overlay containing three panels: a left form
   panel, a central Ignition_Orb panel, and a right contact invite panel.
2. THE central panel SHALL render the Ignition_Orb — a glowing interactive sphere — that pulses
   with electric cyan (`#00e5ff`) by default; WHEN the user modifies any configuration field, THE
   Ignition_Orb SHALL update its color, pulse rate, and size within 300 ms to visually reflect the
   current configuration state.
3. THE left form panel SHALL contain input fields for Zone Name (3–80 characters, alphanumeric
   plus hyphens) and Zone Type (selectable as "Orbital Node" for a direct-message style Zone or
   "Galaxy Cluster" for a group Channel); the panel SHALL also render dynamic sliders for Scale
   (controls initial Orbital_Node display size), Range (controls maximum member visibility radius),
   and Gravity Strength (controls how aggressively Zone_Gravity repositions the node).
4. THE right contact invite panel SHALL render a scrollable toggle list of the user's contacts;
   WHEN the user toggles a contact's invite control to enabled, THE Zone Ignition System SHALL
   include that contact in the post-creation invite list.
5. THE Zone Ignition System SHALL render setup steps as nodes of light along a progress path;
   WHEN a step is completed, THE Zone Ignition System SHALL animate that step node transitioning
   from cyan (`#00e5ff`) to magenta (`#ff6ec7`) within 400 ms.
6. WHEN the user completes all required steps and submits the creation form, THE Zone Ignition
   System SHALL invoke the Channel creation flow defined in Requirement 4 criterion 1, close the
   overlay, and add the new Zone as an Orbital_Node on the canvas within 600 ms.
7. IF the Zone Name submitted in the creation form is already taken as defined in Requirement 4
   criterion 2, THEN THE Zone Ignition System SHALL display an inline validation error on the Zone
   Name field within 300 ms and SHALL NOT proceed to zone creation.
8. WHEN the user closes the Zone Ignition System overlay before completing creation, THE Canvas
   SHALL discard all unsaved wizard state and restore the previous canvas view within 300 ms.

---

### Requirement 19: Zone Observation Deck — Analytics and Moderation

**User Story:** As a zone owner or moderator, I want a dedicated analytics and moderation
dashboard for my Zones, so that I can monitor community health, review activity trends, and take
governance actions.

#### Acceptance Criteria

1. WHEN a zone owner or moderator activates the Observation Deck for a Zone they administer, THE
   Canvas SHALL replace the canvas content with the Zone_Observation_Deck — a full-width data-rich
   administration dashboard rendered with a dark glassmorphism surface.
2. THE Zone_Observation_Deck SHALL render a Daily Chat Volume line chart displaying message counts
   per day for the past 30 days, using neon-line data visualization with electric cyan chart lines.
3. THE Zone_Observation_Deck SHALL render a User Growth Trends bar graph displaying new member
   counts per week for the past 12 weeks.
4. THE Zone_Observation_Deck SHALL render a dynamic moderation queue as a scrolling text stream
   displaying flagged messages and reported events in reverse-chronological order; each queue item
   SHALL include quick-action controls for Approve, Remove, and Escalate that resolve the item
   within 500 ms of activation.
5. THE Zone_Observation_Deck SHALL render granular governance toggles for the zone moderator
   including controls for: Slow Mode (configurable message-rate throttle in seconds), Member Join
   Approval (on/off), Link Previews (on/off), and File Uploads (on/off); WHEN a toggle state is
   changed, THE Zone_Observation_Deck SHALL persist the updated governance setting within 1 second.
6. IF a user who is not an owner or moderator of the Zone attempts to access the
   Zone_Observation_Deck for that Zone, THEN THE Canvas SHALL deny access, display an
   authorization error message, and return to the previous canvas view within 300 ms.
7. WHEN the moderator closes the Zone_Observation_Deck, THE Canvas SHALL restore the canvas view
   of that Zone within 300 ms.

---

### Requirement 20: Whisper Stream — Direct Messages View

**User Story:** As a user, I want a dedicated private messaging view that makes 1-on-1
conversations feel intimate and distinct from group zones, so that I can manage my personal
conversations comfortably.

#### Acceptance Criteria

1. WHEN a user activates the Whisper Stream view, THE Canvas SHALL render a streamlined private
   messaging layout with a linear vertically scrolling priority list of contact avatars on the far
   left and a large Whisper_Stream ribbon area filling the central canvas.
2. THE contact list SHALL display each contact as a simplified circular avatar with the contact's
   display name, the last message timestamp, and a Typing_Indicator for contacts currently
   composing a message; contacts SHALL be ordered with the most recently active at the top.
3. WHEN a user selects a contact in the list, THE Canvas SHALL render a Whisper_Stream ribbon — a
   large flowing light animation connecting the current user's avatar to the selected contact's
   avatar — as the background of the central workspace, and SHALL overlay the DM message
   transcript on top of the ribbon within 400 ms.
4. THE Whisper_Stream message transcript SHALL follow all message rendering rules defined in
   Requirement 16 criteria 2–4 (aligned bubbles, unread marker, and Jump to Latest control).
5. WHEN a user selects a different contact in the list, THE Canvas SHALL transition the
   Whisper_Stream ribbon animation to connect to the newly selected contact within 400 ms, and
   SHALL load that contact's message history according to Requirement 3.
6. THE Whisper_Stream view SHALL surface the Comet_Input field for message composition, docked
   at the bottom of the central transcript area and styled in accordance with the global
   Comet_Input definition in Requirement 12 criterion 6.
7. WHEN a user initiates a voice or video call from the Whisper_Stream view, THE Canvas SHALL
   trigger the WebRTC call flow defined in Requirement 11.

---

### Requirement 21: User Profile and Settings

**User Story:** As a user, I want a full-screen settings page where I can configure my profile,
appearance, notifications, and security preferences, so that I can personalize my Cosmic Canvas
experience.

#### Acceptance Criteria

1. WHEN a user activates the Profile Settings, THE Canvas SHALL replace the canvas content with a
   full-screen configuration page rendered with a dark glassmorphism surface matching the Cosmic
   Canvas design language.
2. THE settings page SHALL display a large profile card at the top containing the user's cosmic-
   framed avatar (circular avatar with a glowing iridescent border), display name, and current
   status.
3. THE settings page SHALL provide tabbed navigation with four tabs: Profile, Appearance & Themes,
   Notifications, and Security; WHEN a user selects a tab, THE settings page SHALL display the
   corresponding settings panel within 200 ms.
4. THE Notifications settings panel SHALL render toggle controls for Zone Alerts, Mentions, and
   Direct Messages; each toggle SHALL render with an iridescent glowing state when enabled,
   using electric cyan (`#00e5ff`) as the active indicator color.
5. THE Appearance & Themes panel SHALL render Nebula Theme selection previews for at least the
   following themes: Nebula Blue (deep navy and cyan), Supernova (deep red-orange and gold), and
   Deep Violet (dark purple and magenta); WHEN a user selects a theme preview, THE application
   SHALL apply the selected theme to the entire canvas within 500 ms.
6. WHEN a user saves changes on the Profile tab, THE application SHALL persist the updated display
   name, avatar, and status to the user's account via the Auth_Service within 2 seconds and
   display a confirmation indicator.
7. IF a profile update request fails, THEN THE settings page SHALL display an inline error message
   indicating the failure and SHALL retain the previously saved values.
8. WHEN the user closes the settings page, THE Canvas SHALL restore the previous canvas view
   within 300 ms.
