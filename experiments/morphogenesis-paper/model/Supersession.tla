------------------------- MODULE Supersession -------------------------
EXTENDS Naturals, FiniteSets
CONSTANTS Proposals, UnsafeDrain, FreshRetry, LegacyLoser
VARIABLES phase, effects, jobs, fenced, head, accepted
vars == <<phase, effects, jobs, fenced, head, accepted>>
Init == /\ phase = [p \in Proposals |-> 0]
        /\ effects = [p \in Proposals |-> 0]
        /\ jobs = [p \in Proposals |-> 0]
        /\ fenced = [p \in Proposals |-> FALSE]
        /\ head = 0 /\ accepted = {}
Prepare(p) == /\ phase[p] = 0 /\ phase' = [phase EXCEPT ![p] = 1]
              /\ UNCHANGED <<effects,jobs,fenced,head,accepted>>
Apply(p) == /\ phase[p] = 1 /\ effects[p] < 2
            /\ effects' = [effects EXCEPT ![p] = IF FreshRetry THEN @ + 1 ELSE 1]
            /\ jobs' = [jobs EXCEPT ![p] = 1]
            /\ phase' \in {[phase EXCEPT ![p] = 2], phase}
            /\ UNCHANGED <<fenced,head,accepted>>
Reconcile(p) == /\ phase[p] = 1 /\ effects[p] > 0
                /\ phase' = [phase EXCEPT ![p] = 2]
                /\ UNCHANGED <<effects,jobs,fenced,head,accepted>>
Commit(p) == /\ phase[p] = 2 /\ head = 0
             /\ head' = p /\ accepted' = accepted \cup {p}
             /\ phase' = [phase EXCEPT ![p] = 3]
             /\ UNCHANGED <<effects,jobs,fenced>>
Lose(p) == /\ phase[p] = 2 /\ head # 0 /\ head # p /\ ~LegacyLoser
           /\ phase' = [phase EXCEPT ![p] = 4]
           /\ UNCHANGED <<effects,jobs,fenced,head,accepted>>
Checkpoint(p) == /\ phase[p] \in {3,4}
                 /\ phase' = [phase EXCEPT ![p] = 5]
                 /\ UNCHANGED <<effects,jobs,fenced,head,accepted>>
Fence(p) == /\ phase[p] = 5 /\ fenced' = [fenced EXCEPT ![p] = TRUE]
            /\ phase' = [phase EXCEPT ![p] = 6]
            /\ UNCHANGED <<effects,jobs,head,accepted>>
FinishJob(p) == /\ jobs[p] = 1 /\ jobs' = [jobs EXCEPT ![p] = 0]
                /\ UNCHANGED <<phase,effects,fenced,head,accepted>>
Detach(p) == /\ phase[p] = 6 /\ (jobs[p] = 0 \/ UnsafeDrain)
             /\ phase' = [phase EXCEPT ![p] = 7]
             /\ UNCHANGED <<effects,jobs,fenced,head,accepted>>
Release(p) == /\ phase[p] = 7 /\ phase' = [phase EXCEPT ![p] = 8]
              /\ UNCHANGED <<effects,jobs,fenced,head,accepted>>
Step(p) == Prepare(p) \/ Apply(p) \/ Reconcile(p) \/ Commit(p) \/ Lose(p)
           \/ Checkpoint(p) \/ Fence(p) \/ FinishJob(p) \/ Detach(p) \/ Release(p)
Next == \E p \in Proposals : Step(p)
Spec == Init /\ [][Next]_vars
        /\ \A p \in Proposals : WF_vars(Step(p)) /\ WF_vars(Reconcile(p)) /\ WF_vars(FinishJob(p))
TypeOK == /\ phase \in [Proposals -> 0..8] /\ effects \in [Proposals -> 0..2]
          /\ jobs \in [Proposals -> 0..1] /\ fenced \in [Proposals -> BOOLEAN]
          /\ head \in Proposals \cup {0} /\ accepted \subseteq Proposals
OneSuccessor == Cardinality(accepted) <= 1
StableEffect == \A p \in Proposals : effects[p] <= 1
SafeTerminal == \A p \in Proposals : phase[p] >= 7 => (fenced[p] /\ jobs[p] = 0)
TerminalHasEffect == \A p \in Proposals : phase[p] = 8 => effects[p] = 1
EventuallyClosed == <> (\A p \in Proposals : phase[p] = 8)
=============================================================================
