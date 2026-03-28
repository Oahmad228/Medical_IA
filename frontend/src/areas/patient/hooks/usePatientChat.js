import { useCallback, useEffect, useState } from "react";
import { api, apiStreamChatMessage } from "../../../lib/api";

// [Module: src/areas/patient/hooks/usePatientChat.js]
// Gere le chat patient et les indicateurs de triage.

// Hook de chat pour l'espace patient.
export function usePatientChat({ token, patientId, onAfterSend, onTriageLevel, onEmotionLevel }) {
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
      const latestAssistant = [...(conversation.messages || [])]
        .reverse()
        .find((m) => m.author === "ASSISTANT" && m.triageLevel);
      if (latestAssistant?.triageLevel && typeof onTriageLevel === "function") {
        onTriageLevel(latestAssistant.triageLevel);
      }
    },
    [onTriageLevel, token]
  );

  const refreshConversations = useCallback(
    async (preferredId) => {
      const data = await api("/chat/conversations", { token });
      setConversations(data);

      const nextId =
        preferredId ||
        (selectedConversationId && data.some((c) => c.id === selectedConversationId)
          ? selectedConversationId
          : data[0]?.id || null);

      setSelectedConversationId(nextId);
      if (nextId) {
        await loadConversation(nextId);
      } else {
        setMessages([]);
      }
    },
    [loadConversation, selectedConversationId, token]
  );

  const createConversation = useCallback(async () => {
    const created = await api("/chat/conversations", {
      method: "POST",
      token,
      payload: { title: "Nouvelle discussion patient" },
    });
    await refreshConversations(created.id);
    return created.id;
  }, [refreshConversations, token]);

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

    setChatSending(true);
    setChatError("");
    let conversationId = selectedConversationId;

    try {
      if (!conversationId) {
        conversationId = await createConversation();
      }

      const payload = {
        message: trimmedMessage,
        location: composer.location || undefined,
        patientId: composer.patientId.trim() ? Number(composer.patientId) : patientId,
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

      let streamedTriage = null;
      try {
        await apiStreamChatMessage(conversationId, {
          token,
          payload,
          onEvent: (evt) => {
            if (evt?.type === "meta" && evt.triageLevel) {
              streamedTriage = evt.triageLevel;
              if (typeof onTriageLevel === "function") {
                onTriageLevel(evt.triageLevel);
              }
            }
            if (evt?.type === "meta" && evt.emotionLevel) {
              if (typeof onEmotionLevel === "function") {
                onEmotionLevel(evt.emotionLevel);
              }
            }
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
        const result = await api(`/chat/conversations/${conversationId}/messages`, {
          method: "POST",
          token,
          payload,
        });
        if (result.triageLevel && typeof onTriageLevel === "function") {
          onTriageLevel(result.triageLevel);
        }
        if (result.emotionLevel && typeof onEmotionLevel === "function") {
          onEmotionLevel(result.emotionLevel);
        }
      }

      if (streamedTriage && typeof onTriageLevel === "function") {
        onTriageLevel(streamedTriage);
      }
      await loadConversation(conversationId);
      await refreshConversations(conversationId);
      if (typeof onAfterSend === "function") {
        await onAfterSend();
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
    composer.location,
    composer.message,
    composer.patientId,
    createConversation,
    loadConversation,
    onAfterSend,
    onEmotionLevel,
    onTriageLevel,
    patientId,
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
    setMessages,
    composer,
    setComposer,
    chatSending,
    chatError,
    loadConversation,
    refreshConversations,
    createConversation,
    deleteConversation,
    sendMessage,
  };
}
