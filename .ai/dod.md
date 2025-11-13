# Definition of Done

## Code Quality
- [ ] Code follows existing package structure and architectural patterns (App/Server/Store layers)
- [ ] Appropriate build tags used (`enterprise`, `sourceavailable`) for edition-specific features
- [ ] Go code passes `make vet` and `make check-style` linting checks
- [ ] TypeScript/React code passes ESLint validation
- [ ] No security vulnerabilities introduced (input validation, authorization checks)

## Testing
- [ ] Unit tests written for new functionality (`*_test.go` files for Go, Jest tests for React)
- [ ] Integration tests added where appropriate (store tests, API tests)
- [ ] Test coverage maintained or improved
- [ ] All tests pass: `make test-server` and `npm test --workspaces`
- [ ] Race condition detection passes: `make test-server-race`

## API & Data Layer
- [ ] New API endpoints follow RESTful conventions and are added to `api4/api.go`
- [ ] Store interface methods defined in `store/` with implementations in `sqlstore/`
- [ ] Database migrations created in `server/build/migrations/` if schema changes
- [ ] Plugin hooks invoked where appropriate for extensibility
- [ ] WebSocket events handled if real-time updates needed

## Documentation
- [ ] Code comments added for complex logic and public APIs
- [ ] ADRs (Architecture Decision Records) updated for architectural changes
- [ ] API documentation updated if endpoints added/modified
- [ ] README or relevant docs updated for new features

## Performance & Security
- [ ] Query optimization considered (prepared statements, batch operations, caching)
- [ ] Authentication and authorization checks implemented
- [ ] Rate limiting considered for new endpoints
- [ ] CSRF/XSS protections in place for webapp changes
- [ ] Plugin compatibility maintained (backward compatible changes)

## Build & Deployment
- [ ] Code builds successfully: `make build` (server) and `npm run build` (webapp)
- [ ] No breaking changes to configuration schema
- [ ] Environment variable overrides documented if added
- [ ] Changes work in both single-instance and cluster deployments
