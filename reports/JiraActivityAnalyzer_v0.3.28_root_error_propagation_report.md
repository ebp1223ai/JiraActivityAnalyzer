# v0.3.28 Root Error Propagation

Runtime Manifest validation owns the first root error at `MODEL_INPUT_MANIFEST_GENERATION`. `AI_MODEL_INPUT_DELIVERY_INCOMPLETE`, `AI_ANALYSIS_NOT_STARTED`, and `AI_ARTIFACT_NOT_SUBMITTED` are recorded as derived outcomes and cannot replace the root. Zero-dispatch token usage is recorded as actual zero.
