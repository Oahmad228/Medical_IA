import { useCallback, useEffect, useState } from "react";
import { api, apiStreamChatMessage } from "../../../lib/api";

// [Module: src/areas/doctor/hooks/useDoctorChat.js]
// Gere l'etat et les actions de chat medecin.

// Hook de chat pour l'espace medecin.
export function useDoctorChat({ token, onAfterSend }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [composer, setComposer] = useState({ message: "", location: "", patientId: "", images: [] });
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");

  const loadConversation = useCallback(
    async (id) => {
      const conversation = await api(`/chat/conversations/${id}/messages`, { token });
      setMessages(conversation.messages || []);
    },
    [token]
  );

  const refreshConversations = useCallback(
    async (preferredId) => {
      const data = await api("/chat/conversations", { token });
      setConversations(data);

      const pid = composer.patientId?.trim() ? Number(composer.patientId) : null;
      const lockedConversation =
        pid && Number.isInteger(pid)
          ? data.find((c) => Number(c.patientId) === pid)
          : null;

      const nextId = preferredId || (lockedConversation ? lockedConversation.id : null) || null;

      setSelectedConversationId(nextId);
      const selected = nextId ? data.find((c) => c.id === nextId) : null;
      if (selected?.patientId) {
        setComposer((prev) => ({ ...prev, patientId: String(selected.patientId) }));
      } else {
        setComposer((prev) => ({ ...prev, patientId: "" }));
      }
      if (nextId) {
        try {
          await loadConversation(nextId);
        } catch (_e) {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }
    },
    [composer.patientId, loadConversation, token]
  );

  const createConversation = useCallback(
    async (options = {}) => {
      const patientIdForLock = options?.patientId;
      const titleOverride = options?.title;
      const pid = patientIdForLock ? Number(patientIdForLock) : null;
      const title =
        typeof titleOverride === "string" && titleOverride.trim()
          ? titleOverride.trim()
          : "Nouveau dossier clinique";
      const created = await api("/chat/conversations", {
        method: "POST",
        token,
        payload: {
          title,
          ...(pid && Number.isInteger(pid) && pid > 0 ? { patientId: pid } : {}),
        },
      });
      await refreshConversations(created.id);
      return created.id;
    },
    [refreshConversations, token]
  );

  const openConversationForPatient = useCallback(
    async ({ patientId, title }) => {
      const pid = Number(patientId);
      if (!Number.isInteger(pid) || pid <= 0) return null;

      setComposer((prev) => ({ ...prev, patientId: String(pid) }));

      const data = await api("/chat/conversations", { token });
      setConversations(data);

      const existing = data.find((conv) => Number(conv.patientId) === pid);
      if (existing?.id) {
        await refreshConversations(existing.id);
        return existing.id;
      }

      return createConversation({ patientId: pid, title: title || `Patient #${pid}` });
    },
    [createConversation, refreshConversations, token]
  );

  const deleteConversation = useCallback(
    async (conversationId) => {
      if (
        !window.confirm(
          "Supprimer cette conversation ? Les messages seront definitivement effaces."
        )
      ) {
        return;
      }
      try {
        await api(`/chat/conversations/${conversationId}`, { method: "DELETE", token });
        const data = await api("/chat/conversations", { token });
        setConversations(data);
        const deletedWasActive = selectedConversationId === conversationId;
        const nextId = deletedWasActive
          ? data[0]?.id ?? null
          : data.some((c) => c.id === selectedConversationId)
          ? selectedConversationId
          : data[0]?.id ?? null;
        setSelectedConversationId(nextId);
        if (nextId) {
          await loadConversation(nextId);
        } else {
          setMessages([]);
        }
      } catch (e) {
        setChatError(e.message || "Impossible de supprimer.");
      }
    },
    [loadConversation, selectedConversationId, token]
  );

  const sendMessage = useCallback(async () => {
    const trimmedMessage = composer.message.trim();
    if (!trimmedMessage) return;

    const patientId = composer.patientId.trim() ? Number(composer.patientId) : null;
    const activeConversation = conversations.find((c) => c.id === selectedConversationId) || null;
    const conversationPatientId = activeConversation?.patientId
      ? Number(activeConversation.patientId)
      : null;
    const effectivePatientId =
      Number.isInteger(patientId) && patientId > 0 ? patientId : conversationPatientId;
    if (conversationPatientId && !effectivePatientId) {
      setChatError("Cette conversation est liee a un patient. Selectionnez-le avant d'envoyer.");
      return;
    }

    setChatSending(true);
    setChatError("");
    let conversationId = selectedConversationId;

    try {
      if (effectivePatientId) {
        const link = await api(`/doctor/patient-link/status?patientId=${effectivePatientId}`, {
          token,
        });
        if (link?.status !== "ACTIVE") {
          setChatError("Associez le patient via OTP avant d'envoyer un rapport.");
          return;
        }
      }

      if (!conversationId) {
        conversationId = await createConversation({ patientId: effectivePatientId || undefined });
      }

      const payload = {
        message: trimmedMessage,
        patientId: effectivePatientId || undefined,
        images: Array.isArray(composer.images) ? composer.images : [],
      };

      const tempUserId = `tmp-user-${Date.now()}`;
      const tempAssistantId = `tmp-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserId,
          author: "USER",
          content: trimmedMessage,
          images: Array.isArray(composer.images) ? composer.images : [],
          createdAt: new Date().toISOString(),
        },
        { id: tempAssistantId, author: "ASSISTANT", content: "", createdAt: new Date().toISOString() },
      ]);
      setComposer((prev) => ({ ...prev, message: "", images: [] }));

      try {
        await apiStreamChatMessage(conversationId, {
          token,
          payload,
          onEvent: (evt) => {
            if (evt?.type === "delta" && typeof evt.delta === "string") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, content: `${m.content}${evt.delta}` } : m
                )
              );
            }
          },
        });
      } catch (_streamError) {
        await api(`/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          token,
          payload,
        });
      }
      await loadConversation(conversationId);
      await refreshConversations(conversationId);
      if (typeof onAfterSend === "function" && effectivePatientId) {
        await onAfterSend(effectivePatientId);
      }
    } catch (error) {
      setChatError(error.message || "Erreur d'envoi du message.");
      if (conversationId) {
        try {
          await loadConversation(conversationId);
          await refreshConversations(conversationId);
        } catch (_refreshError) {
          // Ignore secondary refresh errors.
        }
      }
    } finally {
      setChatSending(false);
    }
  }, [
    composer.images,
    composer.message,
    composer.patientId,
    createConversation,
    loadConversation,
    onAfterSend,
    refreshConversations,
    selectedConversationId,
    token,
  ]);

  useEffect(() => {
    refreshConversations().catch((_error) => {
      setConversations([]);
      setMessages([]);
    });
  }, [refreshConversations]);

  return {
    conversations,
    selectedConversationId,
    setSelectedConversationId,
    messages,
    composer,
    setComposer,
    chatSending,
    chatError,
    setChatError,
    loadConversation,
    refreshConversations,
    createConversation,
    openConversationForPatient,
    deleteConversation,
    sendMessage,
  };
}
