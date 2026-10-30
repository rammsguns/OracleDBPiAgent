# Two-server evals

The product CLI, web UI and reports use only the primary Strata on port 8080.
Only the eval runner accepts the secondary, through a loopback SSH tunnel.
Neither server may be restarted, unloaded or reconfigured by this workflow.

On the eval host, create a dedicated SSH key with a passphrase
(`ssh-keygen -t ed25519`), and have the owner authorize its public key for
`kiwi@192.168.3.254`. Verify the host fingerprint with the owner before
accepting it. Load the key into your SSH agent, then open the tunnel:

```sh
ssh -f -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18080:127.0.0.1:8080 kiwi@192.168.3.254
```

Have the owner place the secondary Strata API key in a local private file
(mode 0600, `chmod 600 /path/to/secondary-api-key`). Never paste its contents
into a command, result file or report. Configure the eval environment:

```sh
export PIAGENT_EVAL_SECONDARY_BASE_URL=http://127.0.0.1:18080/v1
export PIAGENT_EVAL_SECONDARY_API_KEY_FILE=/path/to/secondary-api-key
export PIAGENT_EVAL_SECONDARY_CONTEXT_WINDOW=32768
npm run eval -- --endpoint secondary --suite evals/cases-hard --split dev --repeat 2
```

The URL must match exactly. Context defaults to 32768. With no `--endpoint`,
the runner uses primary and ignores secondary settings. Before any cases run,
health must explicitly report loaded and the configured primary model name;
secondary runs check primary health too. Stop if either server is unloaded or
the model differs. Health requests use no API key and refuse redirects.

A PID lock under the OS temporary directory prevents overlapping runs on the
same endpoint; primary and secondary can run independently. Normal exit,
exceptions, SIGINT and SIGTERM release it. A dead PID is recovered on the next
run. A malformed lock or interrupted recovery requires manual inspection;
never remove a lock while its owning eval is alive. SIGKILL cannot run cleanup.

First compare identical code on both servers (hard dev ×2 each). The secondary
has a k8v4 KV cache and 32k context; primary has q8_0/q8_0 and 131k context.
Results can differ slightly even with the same model. Record this server effect.

For balanced gates, each server runs both baseline and candidate for half the
repeats, interleaved. Keep each server's stream sequential. Measure wall time,
and report each server separately as well as pooled. Do not put all baseline
runs on one server and all candidate runs on the other. Results record endpoint
and a safe loaded/model health snapshot. Both comparison modes accept mixed
endpoint files and warn when the sides have unequal counts of case observations
by endpoint; old files without a label count as primary. Equal pooled counts
alone do not establish a balanced design for each individual case.
