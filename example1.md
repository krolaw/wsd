<script src="wsd.js"></script>

# Alice and Bob Example

<sequence-diagram data="
title: My Title
alias: A->Alice
alias: B->Bob
A->B: Authentication Request\nLine 2\nLine 3
if: If : [Bob doesn't know Alice that well]
note right: B : Bob thinks about it
elif: Else : 
note right: B : Bob still thinks about it
end:
B->A: Authentication Response
A->A: Contemplates\nlife\nchoices
"></sequence-diagram>
