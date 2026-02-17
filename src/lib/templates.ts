/**
 * Report Templates System
 * Configurable templates for different types of reports
 */

export type TemplateSection = {
  id: string;
  title: string;
  description: string;
  required: boolean;
  wordCountTarget: number;
  promptHint: string;
};

export type ReportTemplate = {
  id: string;
  name: string;
  description: string;
  audience: string;
  totalWordTarget: number;
  tone: 'academic' | 'policy' | 'journalistic' | 'technical';
  sections: TemplateSection[];
  systemPrompt: string;
};

export const templates: Record<string, ReportTemplate> = {
  'policy-brief': {
    id: 'policy-brief',
    name: 'Policy Brief',
    description: 'Concise document for policymakers with actionable recommendations',
    audience: 'Government officials, NGO leaders, development practitioners',
    totalWordTarget: 1200,
    tone: 'policy',
    sections: [
      {
        id: 'executive-summary',
        title: 'Executive Summary',
        description: 'Key findings and recommendations in 2-3 paragraphs',
        required: true,
        wordCountTarget: 150,
        promptHint: 'Lead with the main policy recommendation. Be direct and actionable.'
      },
      {
        id: 'context',
        title: 'Context & Challenge',
        description: 'Background on the issue and why it matters now',
        required: true,
        wordCountTarget: 200,
        promptHint: 'Use recent data and trends. Explain urgency without alarmism.'
      },
      {
        id: 'analysis',
        title: 'Analysis',
        description: 'Evidence-based examination of the issue',
        required: true,
        wordCountTarget: 350,
        promptHint: 'Present data clearly. Compare approaches. Acknowledge uncertainties.'
      },
      {
        id: 'recommendations',
        title: 'Policy Recommendations',
        description: 'Specific, actionable steps for decision-makers',
        required: true,
        wordCountTarget: 300,
        promptHint: 'Number recommendations. Be specific about actors and timeframes.'
      },
      {
        id: 'implementation',
        title: 'Implementation Considerations',
        description: 'Practical steps, costs, and potential barriers',
        required: false,
        wordCountTarget: 150,
        promptHint: 'Address feasibility. Mention funding mechanisms if relevant.'
      },
      {
        id: 'conclusion',
        title: 'Conclusion',
        description: 'Call to action and next steps',
        required: true,
        wordCountTarget: 100,
        promptHint: 'Reinforce urgency and primary recommendation.'
      }
    ],
    systemPrompt: `You are a senior policy analyst writing for government officials and international development practitioners. 
Your writing should be:
- Direct and action-oriented
- Evidence-based with proper attribution
- Focused on feasible interventions
- Conscious of political and institutional constraints
- Free of jargon when possible, with technical terms explained
Use bullet points for recommendations. Include specific data points with sources.`
  },

  'research-summary': {
    id: 'research-summary',
    name: 'Research Summary',
    description: 'Academic-style summary of findings on a topic',
    audience: 'Researchers, academics, technical specialists',
    totalWordTarget: 1500,
    tone: 'academic',
    sections: [
      {
        id: 'abstract',
        title: 'Abstract',
        description: 'Overview of topic, methods, and key findings',
        required: true,
        wordCountTarget: 150,
        promptHint: 'Follow standard abstract structure: background, aim, findings, implications.'
      },
      {
        id: 'introduction',
        title: 'Introduction',
        description: 'Research context and objectives',
        required: true,
        wordCountTarget: 250,
        promptHint: 'Establish knowledge gap and research questions.'
      },
      {
        id: 'literature-review',
        title: 'Literature Review',
        description: 'Summary of existing research and evidence',
        required: true,
        wordCountTarget: 350,
        promptHint: 'Synthesize rather than list sources. Identify patterns and gaps.'
      },
      {
        id: 'findings',
        title: 'Key Findings',
        description: 'Main results and insights from the analysis',
        required: true,
        wordCountTarget: 400,
        promptHint: 'Present findings systematically. Use subheadings for clarity.'
      },
      {
        id: 'discussion',
        title: 'Discussion',
        description: 'Interpretation and implications of findings',
        required: true,
        wordCountTarget: 250,
        promptHint: 'Connect to broader literature. Acknowledge limitations.'
      },
      {
        id: 'conclusion',
        title: 'Conclusion & Future Directions',
        description: 'Summary and areas for further research',
        required: true,
        wordCountTarget: 150,
        promptHint: 'Suggest specific research questions for future work.'
      }
    ],
    systemPrompt: `You are an academic researcher writing a research summary for peer review.
Your writing should be:
- Rigorous and methodical
- Properly citing sources and acknowledging limitations
- Objective and balanced in presenting evidence
- Using appropriate academic language and structure
- Clear about what is known vs. uncertain
Always distinguish between correlation and causation. Note sample sizes and study quality.`
  },

  'grant-proposal': {
    id: 'grant-proposal',
    name: 'Grant Proposal Outline',
    description: 'Framework for funding applications',
    audience: 'Foundations, development banks, bilateral donors',
    totalWordTarget: 1800,
    tone: 'technical',
    sections: [
      {
        id: 'problem-statement',
        title: 'Problem Statement',
        description: 'Clear articulation of the challenge to address',
        required: true,
        wordCountTarget: 300,
        promptHint: 'Use data to demonstrate scale and urgency. Be specific about affected populations.'
      },
      {
        id: 'proposed-solution',
        title: 'Proposed Solution',
        description: 'Your approach and theory of change',
        required: true,
        wordCountTarget: 400,
        promptHint: 'Explain the intervention logic. Why will this work where others have not?'
      },
      {
        id: 'target-outcomes',
        title: 'Target Outcomes & Indicators',
        description: 'Measurable goals and success metrics',
        required: true,
        wordCountTarget: 250,
        promptHint: 'Use SMART criteria. Include both output and outcome indicators.'
      },
      {
        id: 'implementation-plan',
        title: 'Implementation Approach',
        description: 'How the project will be executed',
        required: true,
        wordCountTarget: 350,
        promptHint: 'Cover timeline, partnerships, and key activities. Address risks.'
      },
      {
        id: 'sustainability',
        title: 'Sustainability & Scale',
        description: 'Long-term viability and potential for replication',
        required: true,
        wordCountTarget: 200,
        promptHint: 'How will impact continue after funding ends? Path to scale?'
      },
      {
        id: 'budget-overview',
        title: 'Budget Overview',
        description: 'High-level cost breakdown and value proposition',
        required: false,
        wordCountTarget: 150,
        promptHint: 'Show cost-effectiveness. Mention co-funding if relevant.'
      },
      {
        id: 'team-capacity',
        title: 'Team & Organizational Capacity',
        description: 'Why you can deliver this project',
        required: false,
        wordCountTarget: 150,
        promptHint: 'Highlight relevant experience and local partnerships.'
      }
    ],
    systemPrompt: `You are a development professional writing a grant proposal.
Your writing should be:
- Compelling but realistic about outcomes
- Focused on measurable impact
- Clear about theory of change
- Addressing sustainability from the start
- Demonstrating understanding of local context
- Cost-conscious and efficient
Use data to support scale of problem. Be specific about beneficiaries and intervention logic.`
  },

  'executive-briefing': {
    id: 'executive-briefing',
    name: 'Executive Briefing',
    description: 'Quick-read summary for busy leaders',
    audience: 'C-suite executives, board members, senior leadership',
    totalWordTarget: 600,
    tone: 'policy',
    sections: [
      {
        id: 'bottom-line',
        title: 'Bottom Line Up Front',
        description: 'The single most important takeaway',
        required: true,
        wordCountTarget: 50,
        promptHint: 'One paragraph max. What does the reader need to know/do?'
      },
      {
        id: 'situation',
        title: 'Situation Overview',
        description: 'Brief context on the issue',
        required: true,
        wordCountTarget: 150,
        promptHint: 'Use bullet points. Focus on what changed or why this matters now.'
      },
      {
        id: 'options',
        title: 'Options & Trade-offs',
        description: 'Key decision points and considerations',
        required: true,
        wordCountTarget: 200,
        promptHint: 'Present 2-3 clear options with pros/cons for each.'
      },
      {
        id: 'recommendation',
        title: 'Recommendation',
        description: 'Advised course of action',
        required: true,
        wordCountTarget: 100,
        promptHint: 'Be direct. State what you recommend and why.'
      },
      {
        id: 'next-steps',
        title: 'Next Steps',
        description: 'Immediate actions required',
        required: true,
        wordCountTarget: 100,
        promptHint: 'Who does what by when? Be specific.'
      }
    ],
    systemPrompt: `You are writing for a busy executive who has 5 minutes to read this.
Your writing should be:
- Extremely concise - every word must earn its place
- Action-oriented with clear recommendations
- Structured for quick scanning (bullets, bold text)
- Honest about risks and uncertainties
- Focused on decisions, not background
Lead with the conclusion. Assume the reader is intelligent but not an expert on this topic.`
  },

  'situation-report': {
    id: 'situation-report',
    name: 'Situation Report',
    description: 'Status update on an ongoing issue or crisis',
    audience: 'Operations teams, emergency coordinators, field staff',
    totalWordTarget: 800,
    tone: 'technical',
    sections: [
      {
        id: 'current-status',
        title: 'Current Status',
        description: 'What is happening right now',
        required: true,
        wordCountTarget: 200,
        promptHint: 'Be factual and timestamped. What do we know for certain?'
      },
      {
        id: 'changes',
        title: 'Key Changes Since Last Report',
        description: 'What has evolved or changed',
        required: true,
        wordCountTarget: 150,
        promptHint: 'Use comparison language. What improved or worsened?'
      },
      {
        id: 'response',
        title: 'Response Actions',
        description: 'What is being done to address the situation',
        required: true,
        wordCountTarget: 200,
        promptHint: 'Cover interventions, resources deployed, and coordination.'
      },
      {
        id: 'gaps-needs',
        title: 'Gaps & Needs',
        description: 'What resources or actions are still required',
        required: true,
        wordCountTarget: 150,
        promptHint: 'Be specific about quantities and urgency levels.'
      },
      {
        id: 'outlook',
        title: 'Outlook',
        description: 'Expected developments in coming period',
        required: true,
        wordCountTarget: 100,
        promptHint: 'What scenarios should we prepare for?'
      }
    ],
    systemPrompt: `You are writing a situation report for operational coordination.
Your writing should be:
- Factual and precise (include dates, numbers, locations)
- Structured for quick reference
- Clear about certainty levels (confirmed vs. reported vs. estimated)
- Action-oriented on gaps and needs
- Avoiding speculation while noting risks
Use standardized terminology. Be clear about sources of information.`
  }
};

export function getTemplate(templateId: string): ReportTemplate | null {
  return templates[templateId] || null;
}

export function getTemplateList(): { id: string; name: string; description: string }[] {
  return Object.values(templates).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description
  }));
}

export function generateSectionPrompts(template: ReportTemplate, topic: string, research: string): string[] {
  return template.sections.map(section => 
    `## ${section.title}\n${section.description}\nTarget: ~${section.wordCountTarget} words\nGuidance: ${section.promptHint}`
  );
}
