use super::{media::BackendServices, platform::RuntimeConfig};
use crate::runtime::{ai::AIService, mcp::MCPService};
use fluxdi::{Error, Injector, Module, Shared, module::ModuleLifecycleFuture, static_module};

static_module! {
    pub(super) struct IntegrationServices {
        external config: RuntimeConfig;
        #[scope(root)]
        ai: AIService = ai(config);
        #[scope(root)]
        mcp: MCPService = mcp();
    }
}
fn ai(config: Shared<RuntimeConfig>) -> Result<Shared<AIService>, Error> {
    Ok(Shared::new(AIService::new(config.directory.clone())))
}
fn mcp() -> Result<Shared<MCPService>, Error> {
    Ok(Shared::new(MCPService::default()))
}

pub(super) struct IntegrationModule(pub BackendServices);
impl Module for IntegrationModule {
    fn on_start(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
        let graph = self.0.clone();
        Box::pin(async move {
            graph.ai()?;
            graph.mcp()?;
            Ok(())
        })
    }
    fn on_stop(&self, _: Shared<Injector>) -> ModuleLifecycleFuture {
        let graph = self.0.clone();
        Box::pin(async move {
            let mcp = graph.mcp()?;
            if let Some(app) = &graph.config()?.app {
                mcp.stop(app).await;
            } else {
                mcp.shutdown().await;
            }
            graph.ai()?.cancel_all().await;
            Ok(())
        })
    }
}
