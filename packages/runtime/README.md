# @agentplat/runtime

Provider-neutral agent runtime contracts and a small executable runtime.

`DefaultAgentRuntime` registers provider adapters by platform, dispatches runs and streams provider events. Model-provider adapters are separate packages so applications can choose their own providers and credential strategy.
