import { NextResponse } from 'next/server';
import { callOllamaChat, ChatMessage } from '@/lib/ollama';

export const runtime = 'nodejs';

type RefineRequest = {
  content: string;
  action: 'improve' | 'expand' | 'condense' | 'add-data' | 'fix-citations' | 'custom';
  section?: string;
  customPrompt?: string;
  model?: string;
};

const ACTIONS: Record<string, string> = {
  improve: `Improve the writing quality of this section. Make it clearer, more professional, and better structured. Keep the same length and key points.`,
  expand: `Expand this section with more detail, examples, and supporting information. Add 50-100% more content while maintaining quality.`,
  condense: `Condense this section to be more concise. Remove redundancy and tighten language. Reduce length by 30-50% while keeping key points.`,
  'add-data': `Add more specific data points, statistics, and evidence to this section. Mark any claims that need verification with [VERIFY]. Use realistic placeholder data if needed.`,
  'fix-citations': `Review all claims in this section. Add proper citations where missing. Mark unverified claims with [VERIFY]. Remove any fabricated statistics.`,
};

export async function POST(req: Request) {
  try {
    const body: RefineRequest = await req.json();
    const { content, action, section, customPrompt, model = 'llama3.1:8b' } = body;

    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    const systemPrompt = `You are an expert editor refining policy and research documents. 
Your task is to make targeted improvements while preserving the document structure and voice.
Return ONLY the revised content, no explanations or meta-commentary.
Maintain professional, formal tone throughout.`;

    let userPrompt: string;
    
    if (action === 'custom' && customPrompt) {
      userPrompt = `${customPrompt}\n\nContent to refine:\n${content}`;
    } else {
      const actionPrompt = ACTIONS[action] || ACTIONS.improve;
      
      if (section) {
        userPrompt = `${actionPrompt}\n\nFocus on the "${section}" section.\n\nFull document:\n${content}`;
      } else {
        userPrompt = `${actionPrompt}\n\nContent:\n${content}`;
      }
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const refined = await callOllamaChat({
      model,
      messages,
      temperature: 0.3,
      topP: 0.9
    });

    return NextResponse.json({
      refined: refined.trim(),
      action,
      section,
      originalLength: content.length,
      refinedLength: refined.length
    });
  } catch (err) {
    console.error('Refine API error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
