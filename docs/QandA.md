Q&A Summary

Teaming
Q: Can we team up with other solo participants?
A: We’ve enabled the ⁠🫂-team-creation  channel. Please coordinate there and then register the Team Leader accordingly.

Recording
Q: Is this session going to be recorded?
A: Yes, the recording will be send via email.

Access to materials
Q: How can I access materials, deliverables, platform, etc.?
A: They are all here. If we've missed anything, let us know and we'll include it!

Models usage
Q: Which models can we use?
A: Any model can be used.

Demo video requirements
Q: Do we need a step-by-step explanation in the demo video?
A: The video should clearly demonstrate the value and main flow of the solution (step-by-step is not strictly required).

UI / integrations
Q: Do we need to build a ticket UI or can we integrate with Jira/Notion?
A: You should create an input UI. After processing, you can send tickets to Jira, Notion, or other systems.

Local LLM usage
Q: Can I use local LLM models on private servers?
A: Yes, preferably with an OpenAI-compatible endpoint for integration.

Restrictions
Q: Is there anything forbidden?
A: No strict restrictions, but solutions should follow ethical AI principles and responsible AI guidelines.

Security requirements
Q: What level of security implementation is expected?
A: No strict requirements — follow responsible AI principles, though this is open for you to showcase your engineering and creative capabilities.

Ticketing workflow
Q: Can you share an existing ticketing workflow?
A: No predefined system — you can choose and design your own approach. We recommended you to use the Open Source frameworks provided in ⁠⁉️-faq FAQ# 4.

Late registration
Q: Can people who missed registration still join?
A: No

Technical (Docker)
Q: Is it enough if the solution works in Docker?
A: It should. 



These are the only required steps:
Submit the report via UI.
Agent triages on submit: extracts key details + produces an initial technical summary (using code/docs as available).
The agent creates a ticket in a ticketing system (Jira/Linear/Other).
Agent notifies the technical team (email and/or communicator).
When the ticket becomes resolved, the agent notifies the original reporter.

If you can come up with an extra step to classify and address thing agentically, it is a great differentiator and would great. But it is also complex, so up to you!


Q:  think one of the things that were left, to interpretation, or not mentioned, is, "who is going to use our agent?", is this agent designed to help users-facing bugs? or QA people monitoring the ecommerce live... I think is the first... nevertheless, the instructions are clear and I suspect having both in the ecommerce and a separate instance could work too... 

A: "Create an SRE Agent that ingests incident/failure reports for our company e-commerce application, performs initial automated triage (by analyzing code and documentation), and routes the issue to the technical team via our ticketing workflow, with end-to-end notifications for both engineers and the original reporter."

In this sense the Agent/s would be a Software Reliability Engineering team asset and will report to them. It is for internal ticketing operations.

Q: So the original reporter can be both an e-commerce client and an Internal QA/L1 Support? Or is the challenge focused more on one type of original reporter? 
A: The e-commerce client and an Internal QA/L1 Support are good examples of reporters. It can also be a report generated automatically by the infrastructure due to an external attack, malfunction, etc..

The challenge is more focused on "How do you handle and process the reported ticket(s) succesfully", not on the specific ticket. But, if you create a workflow that handles multiple tickets intelligently and such, it is obviously better.

It is up to you to define the scope, what are you addresing, why, and how would you address others. That's why we added the AGENTS_USE.md and SCALING.md, between others, documents as part of the requirements.

You can think of the assignment as: "The request from an internal client". 

Q: [Individual-CarlosBerrio] Good morning mentors. Quick question regarding deployment for the hackathon:

When I share the public repository, the project requires an LLM API key to run. What’s the preferred approach for this?

Should I include a working API key (e.g., via environment variables), or should I instead provide setup instructions in the README so you can use your own API key?

Just want to make sure the project is easy for you to run and evaluate. Thanks!

A: It should NOT include any API keys. You need to provide an .env.example file where those api keys can be configured, with clear explanations for us to use our API keys and run it.

Q: I was wondering weather we can use other Repos in the code for data extraction or the mockup data.

I am trying to use Repo:medusajs/medusa for the E-commerce. I am not sure if it is allowed or if I should just use the one´s proposed on the ⁠🛠️-resources list.

Thank you for the time

A: You are open to choose yours. We just provided recommendations.

Q: We have created some hyphotetical incidences (We studied the most common ones). The thing is that we have a big inventory, but it seems we won't be able to show all of them during the 3 minutes, considering we also have to speak about our architecture, the main workflow, observability, security guardrails, among others.

What do you consider the best option? Should we reduce the quantity of incidences explained in the video to 2, so we have time to show all other aspects of our project in the hackathon?

Our idea: 
We want to show the architecture and workflow of our system. 
Then, show real examples with simulated incidences.
With these simulated incidences, record a video showing how is this displayed in our agents, how our agents work with this and what do they do, and how observability is performed with these test cases

A: I'd suggest you to focus on making the best demo you can, for which a single ticket might be enough.

Then you can clearly explain the coverage of your solution, how you implemented it and such, as part of the repo and the required documents we mentioned. 

They are certainly relevant for consideration, so even if you just demo one or a few tickets, supporting multiple incidents will be relevant.


Q: hey Sebastian, we are going for 2 IAs systems, since github copilot already have a PR review integration, can we use it? so we can trigger it to review the solution after the ticket is move to "QA"?

A: Good idea

