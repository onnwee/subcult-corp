'use client';

import { useState, useEffect } from 'react';
import { useSanctumSocket } from './hooks/useSanctumSocket';
import { SanctumHeader } from './components/SanctumHeader';
import { AgentSidebar } from './components/AgentSidebar';
import { MessageFeed } from './components/MessageFeed';
import { MessageInput } from './components/MessageInput';

export default function SanctumPage() {
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const {
        connected,
        messages,
        typingAgents,
        whisperTarget,
        sendMessage,
        requestHistory,
        setWhisperTarget,
    } = useSanctumSocket();

    // Request history on connect
    useEffect(() => {
        if (connected) {
            requestHistory();
        }
    }, [connected, requestHistory]);

    return (
        <div className='flex h-screen flex-col'>
            <SanctumHeader
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                connected={connected}
                whisperTarget={whisperTarget}
                onExitWhisper={() => setWhisperTarget(null)}
            />

            <div className='flex flex-1 overflow-hidden'>
                <AgentSidebar
                    open={sidebarOpen}
                    typingAgents={typingAgents}
                    whisperTarget={whisperTarget}
                    onWhisper={agentId => setWhisperTarget(agentId)}
                />

                {/* Main Chat Area */}
                <div className='flex flex-1 flex-col min-w-0'>
                    <MessageFeed
                        messages={messages}
                        typingAgents={typingAgents}
                    />

                    <MessageInput
                        onSend={sendMessage}
                        connected={connected}
                        whisperTarget={whisperTarget}
                    />
                </div>
            </div>
        </div>
    );
}
