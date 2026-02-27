import { NextResponse } from 'next/server';
import { runAgents, AgentRunParams } from '@/lib/agents-v2';
import { uploadFileToDrive } from '@/lib/drive';
import { getTemplateList } from '@/lib/templates';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for longer research

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const topic = body?.topic as string;
    const plannerModel = body?.plannerModel as string;
    const writerModel = body?.writerModel as string;
    const factCheckerModel = (body?.factCheckerModel as string) || 'bespoke-minicheck:7b';
    const templateId = (body?.templateId as string) || 'policy-brief';
    const researchDepth = (body?.researchDepth as 'quick' | 'standard' | 'deep') || 'standard';
    const customInstructions = body?.customInstructions as string;
    const autoUpload = Boolean(body?.autoUpload);
    const drive = body?.drive;

    if (!topic || !plannerModel || !writerModel) {
      return NextResponse.json(
        { error: 'topic, plannerModel, and writerModel are required.' }, 
        { status: 400 }
      );
    }

    const params: AgentRunParams = {
      topic,
      plannerModel,
      writerModel,
      factCheckerModel,
      templateId,
      researchDepth,
      customInstructions
    };

    const result = await runAgents(params);

    let driveResult:
      | { fileId?: string; fileName?: string; webViewLink?: string }
      | undefined;

    if (autoUpload) {
      if (!drive) {
        return NextResponse.json(
          { error: 'Drive credentials required for auto upload.' }, 
          { status: 400 }
        );
      }
      // Upload the HTML version to Drive for better formatting
      const htmlPath = path.isAbsolute(result.articlePathHTML)
        ? result.articlePathHTML
        : path.join(process.cwd(), result.articlePathHTML);
      const res = await uploadFileToDrive({ filePath: htmlPath, drive, mimeType: 'text/html' });
      driveResult = { fileId: res.id || undefined, fileName: res.name || undefined, webViewLink: res.webViewLink || undefined };
    }

    return NextResponse.json({ ...result, drive: driveResult });
  } catch (err) {
    console.error('run API error', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET endpoint to retrieve available templates
export async function GET() {
  try {
    const templates = getTemplateList();
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
